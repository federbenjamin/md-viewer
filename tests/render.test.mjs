import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import { marked } from "../web/vendor/marked.esm.js";
import { mathExtension } from "../web/lib/math.js";
import { ALLOWED_URI_REGEXP, PURIFY_CONFIG, createRenderer } from "../web/lib/render.js";

const fixture = (name) => readFile(new URL(`./fixtures/${name}`, import.meta.url), "utf8");

const renderer = createRenderer(new JSDOM("").window);

// Parses the sanitised string the way the viewer's innerHTML assignment would.
function dom(html) {
  return new JSDOM(`<body><main id="content">${html}</main></body>`).window.document.getElementById("content");
}

async function renderFixture(name) {
  const html = renderer.render(await fixture(name));
  return { html, root: dom(html) };
}

const DANGEROUS_TAGS = ["script", "style", "iframe", "object", "embed", "form", "base", "meta", "svg", "frame", "link"];
const URL_ATTRS = ["href", "src", "action", "formaction", "xlink:href", "data", "poster", "srcset"];

function assertNoDangerousNodes(root) {
  for (const tag of DANGEROUS_TAGS) {
    assert.equal(root.querySelectorAll(tag).length, 0, `<${tag}> survived sanitising`);
  }
  for (const el of root.querySelectorAll("*")) {
    for (const attr of el.attributes) {
      assert.ok(!/^on/i.test(attr.name), `${attr.name} handler survived on <${el.localName}>`);
      assert.notEqual(attr.name.toLowerCase(), "style", `style attribute survived on <${el.localName}>`);
      if (URL_ATTRS.includes(attr.name.toLowerCase())) {
        assert.ok(
          !/^\s*(?:javascript|data|vbscript):/i.test(attr.value),
          `${attr.name}="${attr.value}" survived on <${el.localName}>`,
        );
      }
    }
  }
}

test("the hostile fixture leaves no dangerous element, handler, style or script-scheme URL", async () => {
  const { root } = await renderFixture("hostile.md");
  assertNoDangerousNodes(root);
});

test("the hostile fixture's output contains no executable text outside text nodes", async () => {
  const { html } = await renderFixture("hostile.md");
  assert.doesNotMatch(html, /<script/i);
  assert.doesNotMatch(html, /onerror\s*=/i);
  assert.doesNotMatch(html, /onclick\s*=/i);
  assert.doesNotMatch(html, /onload\s*=/i);
  assert.doesNotMatch(html, /href="\s*javascript:/i);
});

test("every javascript: spelling is gone: plain, mixed-case, entity-encoded colon and entity-encoded letter", async () => {
  const { root } = await renderFixture("hostile.md");
  for (const a of root.querySelectorAll("a")) {
    const href = a.getAttribute("href") ?? "";
    assert.doesNotMatch(href, /javascript|vbscript|^data:/i, `link text "${a.textContent}" kept href ${href}`);
  }
  for (const img of root.querySelectorAll("img")) {
    assert.doesNotMatch(img.getAttribute("src") ?? "", /javascript|vbscript|^data:/i);
  }
});

test("data: and vbscript: images and links do not keep their source", async () => {
  const { root } = await renderFixture("hostile.md");
  assert.equal(root.querySelectorAll('[src^="data:"], [href^="data:"], [href^="vbscript:"]').length, 0);
});

test("allowed markup and URLs in the hostile fixture survive sanitising", async () => {
  const { root } = await renderFixture("hostile.md");
  assert.ok(root.querySelector("details > summary"), "details/summary kept");
  assert.ok(root.querySelector("details b"), "<b> kept");
  assert.ok(root.querySelector("details sup"), "<sup> kept");
  assert.ok(root.querySelector('a[href="#top"]'), "fragment link kept as written");
  assert.ok(root.querySelector('a[href="docs/a.md"]'), "relative link kept");
  assert.ok(root.querySelector('img[src="img/x.png"]'), "relative image kept");
  assert.ok(root.querySelector('a[href="mailto:a@b"]'), "mailto kept");
  assert.ok(root.querySelector('a[href="https://example.com/p?q=1"]'), "https kept");
});

test("the heading and text content of the hostile fixture still render", async () => {
  const { root } = await renderFixture("hostile.md");
  assert.equal(root.querySelector("h1")?.textContent, "Hostile document");
  assert.match(root.textContent, /styled paragraph/);
});

test("a GitHub-style README keeps its GFM structure", async () => {
  const { root } = await renderFixture("github-readme.md");
  assert.equal(root.querySelector("h1")?.textContent, "Project title");
  assert.ok(root.querySelector("strong"), "bold");
  assert.ok(root.querySelector("em"), "emphasis");
  assert.ok(root.querySelector("del"), "strikethrough");
  assert.ok(root.querySelector("p > code"), "inline code");
  assert.equal(root.querySelectorAll("table th").length, 2);
  assert.equal(root.querySelectorAll("table tbody tr").length, 2);
  assert.ok(root.querySelector("blockquote"));
  assert.equal(root.querySelectorAll("ol > li").length, 2);
  assert.ok(root.querySelector("hr"));
  assert.ok(root.querySelector("details > summary"));
});

test("task-list checkboxes survive with their checked state", async () => {
  const { root } = await renderFixture("github-readme.md");
  const boxes = [...root.querySelectorAll('input[type="checkbox"]')];
  assert.equal(boxes.length, 2);
  assert.deepEqual(boxes.map((b) => b.hasAttribute("checked")), [true, false]);
});

test("code fences keep their language class, and an unlabelled fence has none", async () => {
  const { root } = await renderFixture("github-readme.md");
  assert.equal(root.querySelectorAll("pre > code.language-js").length, 1);
  assert.equal(root.querySelectorAll("pre > code.language-python").length, 1);
  const plain = [...root.querySelectorAll("pre > code")].find((c) => c.textContent.includes("no language here"));
  assert.ok(plain);
  assert.doesNotMatch(plain.className, /language-/);
});

test("links, autolinks, images and relative URLs survive untouched by the renderer", async () => {
  const { root } = await renderFixture("github-readme.md");
  assert.ok(root.querySelector('a[href="https://example.com/docs"]'));
  assert.ok(root.querySelector('a[href="https://example.com/auto"]'), "GFM autolink");
  assert.ok(root.querySelector('img[src="img/logo.png"][alt="logo"]'));
  assert.ok(root.querySelector('a[href="#project-title"]'));
  assert.ok(root.querySelector('a[href="docs/other.md"]'));
});

test("rendering an empty document gives an empty string", () => {
  assert.equal(renderer.render(""), "");
});

test("two renderers over different windows give the same output for the same input", async () => {
  const other = createRenderer(new JSDOM("").window);
  const md = await fixture("github-readme.md");
  assert.equal(other.render(md), renderer.render(md));
});

test("the shared marked singleton is not given the math extension", () => {
  // createRenderer must use its own Marked instance; configuring the singleton leaks math into every other user of marked.
  createRenderer(new JSDOM("").window).render("$x$");
  assert.doesNotMatch(marked.parse("$x$"), /class="math/);
});

test("ALLOWED_URI_REGEXP accepts http, https, mailto, fragments and scheme-less relative URLs", () => {
  for (const ok of [
    "http://a.example/x",
    "https://a.example/x",
    "HTTPS://A.EXAMPLE/",
    "mailto:a@b",
    "#top",
    "docs/a.md",
    "./a.md",
    "../a.md",
    "/abs/path.md",
    "img/x.png?v=1",
  ]) {
    assert.ok(ALLOWED_URI_REGEXP.test(ok), `${ok} should be allowed`);
  }
});

test("ALLOWED_URI_REGEXP rejects every other scheme, in any case", () => {
  for (const bad of [
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    "data:text/html,x",
    "vbscript:x",
    "file:///etc/passwd",
    "tel:123",
    "ftp://a.example/",
    "blob:https://a.example/id",
  ]) {
    assert.ok(!ALLOWED_URI_REGEXP.test(bad), `${bad} should be refused`);
  }
});

test("PURIFY_CONFIG forbids style, uses the html profile and carries the URI allow-list", () => {
  assert.deepEqual(PURIFY_CONFIG.USE_PROFILES, { html: true });
  assert.ok(PURIFY_CONFIG.FORBID_TAGS.includes("style"));
  assert.ok(PURIFY_CONFIG.FORBID_ATTR.includes("style"));
  assert.equal(PURIFY_CONFIG.ALLOWED_URI_REGEXP, ALLOWED_URI_REGEXP);
});

// Math

const mathOf = (md) => dom(renderer.render(md));

test("inline math becomes a math-inline span holding the TeX source", () => {
  const root = mathOf("Inline $E=mc^2$ here.");
  const spans = root.querySelectorAll("span.math.math-inline");
  assert.equal(spans.length, 1);
  assert.equal(spans[0].textContent, "E=mc^2");
  assert.equal(spans[0].attributes.length, 1, "class is the only attribute");
});

test("block math spanning lines becomes a math-block div with the TeX source", () => {
  const root = mathOf("$$\n\\frac{a}{b}\n= c\n$$");
  const blocks = root.querySelectorAll("div.math.math-block");
  assert.equal(blocks.length, 1);
  assert.match(blocks[0].textContent, /\\frac\{a\}\{b\}\s*=\s*c/);
  assert.equal(root.querySelectorAll(".math-inline").length, 0);
});

test("the placeholder survives sanitising: the rendered output already contains it", () => {
  const html = renderer.render("$x$");
  assert.match(html, /<span class="math math-inline">x<\/span>/);
});

test("TeX containing markup characters is escaped text, never an element", () => {
  const root = mathOf("Less-than $a<b$ and $$\n<img src=x onerror=alert(1)>\n$$");
  assert.equal(root.querySelectorAll("img").length, 0);
  assert.equal(root.querySelector("span.math-inline")?.textContent, "a<b");
  assert.match(root.querySelector("div.math-block")?.textContent ?? "", /<img src=x onerror=alert\(1\)>/);
});

test("underscores inside math do not become emphasis", () => {
  const root = mathOf("$a_i$ text $b_j$");
  assert.equal(root.querySelectorAll("em, strong").length, 0);
  assert.deepEqual([...root.querySelectorAll(".math-inline")].map((n) => n.textContent), ["a_i", "b_j"]);
});

test("a longer math span with several underscores stays one placeholder", () => {
  const root = mathOf("$a_i + b_i + c_i$");
  assert.equal(root.querySelectorAll("em").length, 0);
  assert.deepEqual([...root.querySelectorAll(".math-inline")].map((n) => n.textContent), ["a_i + b_i + c_i"]);
});

test("emphasis outside math still renders next to math", () => {
  const root = mathOf("*em* and $x$ and _also em_");
  assert.equal(root.querySelectorAll("em").length, 2);
  assert.equal(root.querySelectorAll(".math-inline").length, 1);
});

test("an escaped dollar is a literal dollar, not math", () => {
  const root = mathOf("Escaped \\$5 and \\$10 are prose.");
  assert.equal(root.querySelectorAll(".math").length, 0);
  assert.match(root.textContent, /Escaped \$5 and \$10 are prose\./);
});

test("currency text with two dollar signs stays prose", () => {
  const root = mathOf("Currency $5 and $10 is prose.");
  assert.equal(root.querySelectorAll(".math").length, 0);
  assert.match(root.textContent, /Currency \$5 and \$10 is prose\./);
});

test("a closing dollar followed by a digit does not close inline math", () => {
  const root = mathOf("Costs $x$5 total");
  assert.equal(root.querySelectorAll(".math").length, 0);
});

test("a dollar followed by a space does not open math", () => {
  const root = mathOf("Pay $ x$ now");
  assert.equal(root.querySelectorAll(".math").length, 0);
});

test("dollars inside a code span stay literal", () => {
  const root = mathOf("Code `$x$` here");
  assert.equal(root.querySelectorAll(".math").length, 0);
  assert.equal(root.querySelector("code")?.textContent, "$x$");
});

test("dollars inside a fenced block stay literal", () => {
  const root = mathOf("```\n$y$ and $$z$$\n```");
  assert.equal(root.querySelectorAll(".math").length, 0);
  assert.equal(root.querySelector("pre > code")?.textContent.trim(), "$y$ and $$z$$");
});

test("math.md renders six inline placeholders and one block placeholder", async () => {
  const { root } = await renderFixture("math.md");
  assert.equal(root.querySelectorAll("span.math-inline").length, 6);
  assert.equal(root.querySelectorAll("div.math-block").length, 1);
  assert.equal(root.querySelectorAll("em").length, 0);
});

test("mathExtension has the marked extension shape", () => {
  assert.ok(Array.isArray(mathExtension.extensions));
  assert.equal(mathExtension.extensions.length, 2);
  assert.equal(typeof mathExtension.hooks.emStrongMask, "function");
});

test("hostile KaTeX fixture: no element, handler or script URL comes out of the placeholders", async () => {
  const { root } = await renderFixture("hostile-katex.md");
  assertNoDangerousNodes(root);
  assert.equal(root.querySelectorAll("a, img").length, 0);
  assert.ok(root.querySelectorAll(".math").length >= 1);
});

test("hostile KaTeX fixture keeps the TeX as text for KaTeX to refuse later", async () => {
  const { root } = await renderFixture("hostile-katex.md");
  assert.match(root.textContent, /href\{javascript:alert\(1\)\}/);
});

// Mermaid

test("a mermaid fence survives as pre > code.language-mermaid with its text verbatim", () => {
  const root = mathOf("```mermaid\ngraph TD\n  A --> B\n```");
  const code = root.querySelector("pre > code.language-mermaid");
  assert.ok(code);
  assert.equal(code.textContent, "graph TD\n  A --> B\n");
});

test("hostile mermaid fixture: markup in the fence is text, with no element created", async () => {
  const { root } = await renderFixture("hostile-mermaid.md");
  assertNoDangerousNodes(root);
  assert.equal(root.querySelectorAll("img").length, 0);
  const codes = root.querySelectorAll("pre > code.language-mermaid");
  assert.equal(codes.length, 2);
  // Mermaid later receives exactly this text, so the <script> must arrive as characters.
  assert.match(codes[0].textContent, /<script>alert\(1\)<\/script>/);
  assert.match(codes[1].textContent, /securityLevel/);
});
