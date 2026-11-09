import assert from "node:assert/strict";
import { test } from "node:test";
import DOMPurify from "dompurify";
import katex from "katex";
import { JSDOM } from "jsdom";
import { KATEX_PURIFY_CONFIG, applyEnhancements, enhancementsFor } from "../web/lib/enhance.js";

function rootFor(html) {
  const { window } = new JSDOM(`<!doctype html><main id="root">${html}</main>`);
  return { window, root: window.document.getElementById("root") };
}

const fakeHljs = () => {
  const calls = [];
  return { calls, highlightElement: (el) => calls.push(el) };
};

// ---- enhancementsFor ----

test("a document with no code, math or diagrams asks for no libraries", () => {
  const { root } = rootFor("<h1>Hi</h1><p>text with <code>inline</code></p><pre>no class</pre>");
  assert.deepEqual(enhancementsFor(root), { highlight: false, math: false, mermaid: false });
});

test("a language code block asks for highlighting only", () => {
  const { root } = rootFor('<pre><code class="language-js">x</code></pre>');
  assert.deepEqual(enhancementsFor(root), { highlight: true, math: false, mermaid: false });
});

test("a code block without a language class does not load highlight.js", () => {
  const { root } = rootFor("<pre><code>x</code></pre>");
  assert.equal(enhancementsFor(root).highlight, false);
});

test("a mermaid fence asks for mermaid and not for highlighting", () => {
  const { root } = rootFor('<pre><code class="language-mermaid">graph TD; A--&gt;B</code></pre>');
  assert.deepEqual(enhancementsFor(root), { highlight: false, math: false, mermaid: true });
});

test("a mermaid fence beside a js fence asks for both", () => {
  const { root } = rootFor(
    '<pre><code class="language-mermaid">a</code></pre><pre><code class="language-js">b</code></pre>',
  );
  assert.deepEqual(enhancementsFor(root), { highlight: true, math: false, mermaid: true });
});

test("inline or block math placeholders ask for katex", () => {
  assert.equal(enhancementsFor(rootFor('<span class="math math-inline">x</span>').root).math, true);
  assert.equal(enhancementsFor(rootFor('<div class="math math-block">x</div>').root).math, true);
});

test("a language-* class on something that is not a pre > code does not trigger highlighting", () => {
  const { root } = rootFor('<p class="language-js">x</p><code class="language-js">y</code>');
  assert.equal(enhancementsFor(root).highlight, false);
});

// ---- applyEnhancements: highlight ----

test("hljs runs once per language block and never for a mermaid fence", async () => {
  const { root } = rootFor(
    '<pre><code class="language-js">a</code></pre>' +
      '<pre><code class="language-python">b</code></pre>' +
      '<pre><code class="language-mermaid">graph TD</code></pre>' +
      "<pre><code>plain</code></pre>",
  );
  const hljs = fakeHljs();
  await applyEnhancements(root, { hljs });
  assert.deepEqual(
    hljs.calls.map((el) => el.className),
    ["language-js", "language-python"],
  );
});

test("without libs.hljs a language block is left untouched and nothing throws", async () => {
  const { root } = rootFor('<pre><code class="language-js">a</code></pre>');
  const before = root.innerHTML;
  await applyEnhancements(root, {});
  assert.equal(root.innerHTML, before);
});

// ---- applyEnhancements: math ----

test("real katex renders \\frac into a .katex node inside the placeholder", async () => {
  const { window, root } = rootFor('<span class="math math-inline">\\frac{a}{b}</span>');
  await applyEnhancements(root, { katex, purify: DOMPurify(window) });
  const el = root.querySelector(".math");
  assert.ok(el.querySelector(".katex"), el.innerHTML);
  assert.equal(el.querySelector(".katex-display"), null);
});

test("a block placeholder renders in display mode", async () => {
  const { window, root } = rootFor('<div class="math math-block">\\frac{a}{b}</div>');
  await applyEnhancements(root, { katex, purify: DOMPurify(window) });
  assert.ok(root.querySelector(".math .katex-display"));
});

test("a \\href{javascript:...} in math yields no anchor", async () => {
  const { window, root } = rootFor('<span class="math math-inline">\\href{javascript:alert(1)}{click}</span>');
  await applyEnhancements(root, { katex, purify: DOMPurify(window) });
  assert.equal(root.querySelector("a"), null);
  // With trust unset KaTeX keeps the source only as inert annotation text (ran katex.renderToString); what matters is no live href.
  assert.equal(root.querySelector("[href], [xlink\\:href]"), null);
});

test("a malformed formula does not throw because throwOnError is false", async () => {
  const { window, root } = rootFor('<span class="math math-inline">\\frac{</span>');
  await assert.doesNotReject(applyEnhancements(root, { katex, purify: DOMPurify(window) }));
  assert.ok(root.querySelector(".math").innerHTML.length > 0);
});

test("katex gets the tex source, displayMode by class, throwOnError false and no trust option", async () => {
  const { root } = rootFor('<span class="math math-inline">a_i</span><div class="math math-block">b^2</div>');
  const seen = [];
  const fakeKatex = {
    renderToString(tex, opts) {
      seen.push([tex, opts]);
      return `<b>${tex}</b>`;
    },
  };
  const sanitized = [];
  const purify = {
    sanitize(html, config) {
      sanitized.push([html, config]);
      return `S(${html})`;
    },
  };
  await applyEnhancements(root, { katex: fakeKatex, purify });
  assert.deepEqual(seen, [
    ["a_i", { displayMode: false, throwOnError: false }],
    ["b^2", { displayMode: true, throwOnError: false }],
  ]);
  assert.ok(!("trust" in seen[0][1]));
  // KaTeX output is run through DOMPurify with the exported config, and the result is what lands in the DOM.
  assert.deepEqual(
    sanitized.map(([, c]) => c),
    [KATEX_PURIFY_CONFIG, KATEX_PURIFY_CONFIG],
  );
  assert.equal(root.querySelector(".math-inline").innerHTML, "S(<b>a_i</b>)");
  assert.equal(root.querySelector(".math-block").innerHTML, "S(<b>b^2</b>)");
});

test("KATEX_PURIFY_CONFIG enables html, svg and mathMl profiles", () => {
  assert.deepEqual(KATEX_PURIFY_CONFIG, { USE_PROFILES: { html: true, svg: true, mathMl: true } });
});

test("math is left as source when purify is missing, so unsanitised KaTeX output never lands", async () => {
  const { root } = rootFor('<span class="math math-inline">x</span>');
  let called = false;
  await applyEnhancements(root, { katex: { renderToString: () => ((called = true), "<b>x</b>") } });
  assert.equal(root.querySelector(".math").innerHTML, "x");
  assert.equal(called, false);
});

test("math is left untouched when katex is missing", async () => {
  const { window, root } = rootFor('<span class="math math-inline">x</span>');
  await applyEnhancements(root, { purify: DOMPurify(window) });
  assert.equal(root.querySelector(".math").innerHTML, "x");
});

// ---- applyEnhancements: mermaid ----

const fakeMermaid = (impl) => {
  const initialize = [];
  const renders = [];
  return {
    initialize: (config) => initialize.push(config),
    render: async (id, text) => {
      renders.push({ id, text });
      return impl ? impl(id, text) : { svg: `<svg data-id="${id}"></svg>` };
    },
    initialize_calls: initialize,
    renders,
  };
};

test("mermaid is initialised once per call with startOnLoad false, strict security and the default theme", async () => {
  const { root } = rootFor(
    '<pre><code class="language-mermaid">a</code></pre><pre><code class="language-mermaid">b</code></pre>',
  );
  const mermaid = fakeMermaid();
  await applyEnhancements(root, { mermaid });
  assert.deepEqual(mermaid.initialize_calls, [{ startOnLoad: false, securityLevel: "strict", theme: "default" }]);
});

test("dark mode picks the dark mermaid theme", async () => {
  const { root } = rootFor('<pre><code class="language-mermaid">a</code></pre>');
  const mermaid = fakeMermaid();
  await applyEnhancements(root, { mermaid }, { dark: true });
  assert.equal(mermaid.initialize_calls[0].theme, "dark");
  assert.equal(mermaid.initialize_calls[0].securityLevel, "strict");
});

test("the pre is replaced by div.mermaid holding the returned svg as-is", async () => {
  const { root } = rootFor('<p>x</p><pre><code class="language-mermaid">graph TD; A--&gt;B</code></pre>');
  const mermaid = fakeMermaid(() => ({ svg: '<svg id="out"><g></g></svg>' }));
  await applyEnhancements(root, { mermaid });
  assert.equal(root.querySelector("pre"), null);
  const div = root.querySelector("div.mermaid");
  assert.equal(div.innerHTML, '<svg id="out"><g></g></svg>');
  // The diagram keeps its place after the paragraph.
  assert.equal(div.previousElementSibling.tagName, "P");
});

test("render receives the fence text verbatim, a literal <script> arriving as text", async () => {
  const { root } = rootFor(
    '<pre><code class="language-mermaid">graph TD\n  A[&lt;script&gt;alert(1)&lt;/script&gt;] --&gt; B</code></pre>',
  );
  const mermaid = fakeMermaid();
  await applyEnhancements(root, { mermaid });
  assert.equal(mermaid.renders.length, 1);
  assert.equal(mermaid.renders[0].text, "graph TD\n  A[<script>alert(1)</script>] --> B");
});

test("each diagram gets its own render id", async () => {
  const { root } = rootFor(
    '<pre><code class="language-mermaid">a</code></pre><pre><code class="language-mermaid">b</code></pre>',
  );
  const mermaid = fakeMermaid();
  await applyEnhancements(root, { mermaid });
  assert.equal(new Set(mermaid.renders.map((r) => r.id)).size, 2);
  assert.equal(root.querySelectorAll("div.mermaid").length, 2);
});

test("a throwing render leaves its pre in place and the other diagram still renders", async () => {
  const { root } = rootFor(
    '<pre><code class="language-mermaid">bad</code></pre><pre><code class="language-mermaid">good</code></pre>',
  );
  const mermaid = fakeMermaid((id, text) => {
    if (text === "bad") throw new Error("parse error");
    return { svg: "<svg></svg>" };
  });
  await assert.doesNotReject(applyEnhancements(root, { mermaid }));
  assert.equal(root.querySelectorAll("pre").length, 1);
  assert.equal(root.querySelector("pre code").textContent, "bad");
  assert.equal(root.querySelectorAll("div.mermaid").length, 1);
});

test("a rejected (async) render also leaves the pre in place", async () => {
  const { root } = rootFor('<pre><code class="language-mermaid">bad</code></pre>');
  const mermaid = fakeMermaid(() => Promise.reject(new Error("nope")));
  await assert.doesNotReject(applyEnhancements(root, { mermaid }));
  assert.ok(root.querySelector("pre"));
  assert.equal(root.querySelector("div.mermaid"), null);
});

test("without libs.mermaid the fence is left untouched", async () => {
  const { root } = rootFor('<pre><code class="language-mermaid">a</code></pre>');
  const before = root.innerHTML;
  await applyEnhancements(root, { hljs: fakeHljs() });
  assert.equal(root.innerHTML, before);
});

test("a plain document with all libs supplied touches nothing", async () => {
  const { window, root } = rootFor("<h1>Hi</h1><p>text</p>");
  const before = root.innerHTML;
  const hljs = fakeHljs();
  const mermaid = fakeMermaid();
  await applyEnhancements(root, { hljs, katex, purify: DOMPurify(window), mermaid });
  assert.equal(root.innerHTML, before);
  assert.equal(hljs.calls.length, 0);
  assert.equal(mermaid.renders.length, 0);
});
