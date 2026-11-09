import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import { createRenderer } from "../web/lib/render.js";
import { resolveUrl, rewriteUrls } from "../web/lib/urls.js";

// Expected values below were derived with `new URL(value, SRC).href` in Node (WHATWG URL).
const SRC = "https://raw.githubusercontent.com/o/r/main/docs/guide.md?token=abc#top";
const DIR = "https://raw.githubusercontent.com/o/r/main/docs/";

function fragment(html) {
  const { document } = new JSDOM("<!doctype html><body></body>").window;
  const root = document.createElement("div");
  root.innerHTML = html;
  return root;
}

test("resolveUrl keeps a #fragment as written, with or without a base", () => {
  assert.equal(resolveUrl("#top", SRC), "#top");
  assert.equal(resolveUrl("#top", null), "#top");
});

test("resolveUrl returns absolute http, https and mailto values byte for byte", () => {
  // No normalisation: a bare origin must not gain a trailing slash.
  assert.equal(resolveUrl("https://example.com", SRC), "https://example.com");
  assert.equal(resolveUrl("http://example.com/a b", SRC), "http://example.com/a b");
  assert.equal(resolveUrl("mailto:a@b", SRC), "mailto:a@b");
  assert.equal(resolveUrl("https://example.com", null), "https://example.com");
  assert.equal(resolveUrl("mailto:a@b", null), "mailto:a@b");
});

test("resolveUrl resolves relative values against the document's directory, dropping its query and fragment", () => {
  assert.equal(resolveUrl("img/x.png", SRC), DIR + "img/x.png");
  assert.equal(resolveUrl("./a.md", SRC), DIR + "a.md");
  assert.equal(resolveUrl("../x.png", SRC), "https://raw.githubusercontent.com/o/r/main/x.png");
  assert.equal(resolveUrl("sub/a.md#sec", SRC), DIR + "sub/a.md#sec");
});

test("resolveUrl resolves a root-relative path against the origin, not the document directory", () => {
  assert.equal(resolveUrl("/root.png", SRC), "https://raw.githubusercontent.com/root.png");
});

test("resolveUrl percent-encodes a space in a relative path", () => {
  assert.equal(resolveUrl("a b.png", SRC), DIR + "a%20b.png");
});

test("resolveUrl returns null for a relative value when there is no base", () => {
  assert.equal(resolveUrl("img/x.png", null), null);
  assert.equal(resolveUrl("../a.md", null), null);
  assert.equal(resolveUrl("/root.png", null), null);
});

test("rewriteUrls resolves relative links and images against src", () => {
  const root = fragment('<p><a href="docs/a.md">a</a> <img src="img/x.png" alt="x"></p>');
  rewriteUrls(root, { src: SRC });
  assert.equal(root.querySelector("a").getAttribute("href"), DIR + "docs/a.md");
  assert.equal(root.querySelector("img").getAttribute("src"), DIR + "img/x.png");
});

test("rewriteUrls rewrites every matching element, not just the first", () => {
  const root = fragment('<a href="a.md">1</a><a href="b.md">2</a><img src="1.png" alt=""><img src="2.png" alt="">');
  rewriteUrls(root, { src: SRC });
  assert.deepEqual(
    [...root.querySelectorAll("a")].map((a) => a.getAttribute("href")),
    [DIR + "a.md", DIR + "b.md"],
  );
  assert.deepEqual(
    [...root.querySelectorAll("img")].map((i) => i.getAttribute("src")),
    [DIR + "1.png", DIR + "2.png"],
  );
});

test("rewriteUrls leaves #fragment links untouched with and without src", () => {
  for (const src of [SRC, null]) {
    const root = fragment('<a href="#top">t</a><a href="#sec-2">s</a>');
    rewriteUrls(root, { src });
    assert.deepEqual(
      [...root.querySelectorAll("a")].map((a) => a.getAttribute("href")),
      ["#top", "#sec-2"],
    );
  }
});

test("rewriteUrls leaves absolute http, https and mailto values untouched", () => {
  const root = fragment(
    '<a href="https://example.com">a</a><a href="mailto:a@b">m</a><img src="http://example.com/i.png" alt="i">',
  );
  for (const src of [SRC, null]) {
    rewriteUrls(root, { src });
    assert.equal(root.querySelectorAll("a")[0].getAttribute("href"), "https://example.com");
    assert.equal(root.querySelectorAll("a")[1].getAttribute("href"), "mailto:a@b");
    assert.equal(root.querySelector("img").getAttribute("src"), "http://example.com/i.png");
  }
});

test("rewriteUrls ignores an anchor with no href", () => {
  const root = fragment('<a name="x">anchor</a>');
  rewriteUrls(root, { src: SRC });
  assert.equal(root.querySelector("a").hasAttribute("href"), false);
  assert.equal(root.innerHTML, '<a name="x">anchor</a>');
});

test("rewriteUrls twice gives the same result as once", () => {
  const html = '<a href="a.md">a</a><img src="x.png" alt="x">';
  const once = fragment(html);
  rewriteUrls(once, { src: SRC });
  const twice = fragment(html);
  rewriteUrls(twice, { src: SRC });
  rewriteUrls(twice, { src: SRC });
  assert.equal(twice.innerHTML, once.innerHTML);
});

test("with src null a relative image becomes its alt text in place", () => {
  const root = fragment('<p>before <img src="img/x.png" alt="the logo"> after</p>');
  rewriteUrls(root, { src: null });
  assert.equal(root.querySelector("img"), null);
  assert.equal(root.querySelector("p").textContent, "before the logo after");
});

test("with src null the alt text is inserted as text, never parsed as markup", () => {
  const root = fragment('<p><img src="x.png" alt="&lt;b&gt;bold&lt;/b&gt; &amp; more"></p>');
  rewriteUrls(root, { src: null });
  assert.equal(root.querySelector("b"), null);
  assert.equal(root.querySelector("p").textContent, "<b>bold</b> & more");
});

test("with src null a relative image with empty or missing alt is removed", () => {
  const root = fragment('<p>a<img src="x.png" alt="">b<img src="y.png">c</p>');
  rewriteUrls(root, { src: null });
  assert.equal(root.querySelector("img"), null);
  assert.equal(root.querySelector("p").textContent, "abc");
});

test("with src null a remote image stays an image", () => {
  const root = fragment('<img src="https://example.com/i.png" alt="remote"><img src="img/x.png" alt="local">');
  rewriteUrls(root, { src: null });
  const imgs = root.querySelectorAll("img");
  assert.equal(imgs.length, 1);
  assert.equal(imgs[0].getAttribute("src"), "https://example.com/i.png");
  assert.equal(root.textContent, "local");
});

test("with src null a link that cannot resolve loses its href and keeps its text", () => {
  for (const href of ["docs/a.md", "./a.md", "../a.md", "/root.md", "//other/a.md", "?q=1", "", "   "]) {
    const root = fragment(`<a href="${href}">next</a>`);
    rewriteUrls(root, { src: null });
    assert.equal(root.querySelector("a").hasAttribute("href"), false, JSON.stringify(href));
    assert.equal(root.textContent, "next");
  }
});

test("a link that cannot resolve against a base loses its href", () => {
  const root = fragment('<a href="//[bad/a.md">bad</a>');
  rewriteUrls(root, { src: SRC });
  assert.equal(root.querySelector("a").hasAttribute("href"), false);
  assert.equal(root.textContent, "bad");
});

test("an image-map area is rewritten and neutralised like a link", () => {
  const html = '<map name="m"><area href="docs/a.md" alt="a"><area href="#top" alt="t"></map>';
  const based = fragment(html);
  rewriteUrls(based, { src: SRC });
  assert.equal(based.querySelector("area").getAttribute("href"), DIR + "docs/a.md");
  const local = fragment(html);
  rewriteUrls(local, { src: null });
  const [relative, hash] = local.querySelectorAll("area");
  assert.equal(relative.hasAttribute("href"), false);
  assert.equal(hash.getAttribute("href"), "#top");
});

test("srcset candidates resolve against src and keep their descriptors", () => {
  const root = fragment('<img srcset="a.png 1x, sub/b.png 2x,../c.png 480w" src="a.png" alt="x">');
  rewriteUrls(root, { src: SRC });
  assert.equal(
    root.querySelector("img").getAttribute("srcset"),
    `${DIR}a.png 1x, ${DIR}sub/b.png 2x, https://raw.githubusercontent.com/o/r/main/c.png 480w`,
  );
});

test("a comma inside a srcset URL stays in that URL, and a trailing comma closes the candidate", () => {
  const root = fragment('<img srcset="a,b.png 1x, c.png, d.png 2x" src="a.png" alt="x">');
  rewriteUrls(root, { src: SRC });
  assert.equal(root.querySelector("img").getAttribute("srcset"), `${DIR}a,b.png 1x, ${DIR}c.png, ${DIR}d.png 2x`);
});

test("a picture's relative source resolves against src through the renderer", () => {
  const { window } = new JSDOM("<!doctype html><body></body>");
  const root = window.document.createElement("div");
  root.innerHTML = createRenderer(window).render(
    '<picture><source media="(prefers-color-scheme: dark)" srcset="img/dark.png"><img src="img/light.png" alt="logo"></picture>',
  );
  rewriteUrls(root, { src: SRC });
  assert.equal(root.querySelector("source").getAttribute("srcset"), DIR + "img/dark.png");
  assert.equal(root.querySelector("img").getAttribute("src"), DIR + "img/light.png");
});

test("with src null a picture's relative source is removed and the image falls back to its alt text", () => {
  const root = fragment('<picture><source srcset="img/dark.png"><img src="img/light.png" alt="logo"></picture>');
  rewriteUrls(root, { src: null });
  assert.equal(root.querySelector("source").hasAttribute("srcset"), false);
  assert.equal(root.querySelector("img"), null);
  assert.equal(root.textContent, "logo");
});

test("with src null a picture's relative source is removed while a remote image stays", () => {
  const root = fragment('<picture><source srcset="dark.png 2x"><img src="https://example.com/i.png" alt="x"></picture>');
  rewriteUrls(root, { src: null });
  assert.equal(root.querySelector("source").hasAttribute("srcset"), false);
  assert.equal(root.querySelector("img").getAttribute("src"), "https://example.com/i.png");
});

test("with src null an image with only a relative srcset becomes its alt text", () => {
  const root = fragment('<p>a <img srcset="x.png 2x" alt="the logo"> b</p>');
  rewriteUrls(root, { src: null });
  assert.equal(root.querySelector("img"), null);
  assert.equal(root.querySelector("p").textContent, "a the logo b");
});

test("with src null only the candidates that cannot resolve are dropped", () => {
  const root = fragment('<source srcset="x.png 1x, https://example.com/y.png 2x">');
  rewriteUrls(root, { src: null });
  assert.equal(root.querySelector("source").getAttribute("srcset"), "https://example.com/y.png 2x");
});

test("no srcset candidate is left scheme-less or on a scheme other than http(s)", () => {
  const values = ["#top 1x", "a.png 1x, javascript:alert(1) 2x", "a.png 1x, data:image/png;base64,AAAA 2x", "", "   ", ",,,"];
  for (const src of [SRC, null]) {
    for (const value of values) {
      const root = fragment('<source srcset="placeholder">');
      root.querySelector("source").setAttribute("srcset", value);
      rewriteUrls(root, { src });
      const kept = root.querySelector("source").getAttribute("srcset");
      for (const candidate of (kept ?? "").split(", ").filter(Boolean)) {
        assert.match(candidate, /^https:\/\//, `${JSON.stringify(value)} kept ${candidate}`);
      }
    }
  }
});

test("rewriteUrls twice leaves a srcset as once", () => {
  const html = '<img srcset="a,b.png 1x, c.png 2x" src="a.png" alt="x">';
  const once = fragment(html);
  rewriteUrls(once, { src: SRC });
  const twice = fragment(html);
  rewriteUrls(twice, { src: SRC });
  rewriteUrls(twice, { src: SRC });
  assert.equal(twice.innerHTML, once.innerHTML);
});

test("with src null an image inside a link is replaced and the link survives", () => {
  const root = fragment('<a href="https://example.com"><img src="badge.svg" alt="build"></a>');
  rewriteUrls(root, { src: null });
  const a = root.querySelector("a");
  assert.equal(a.getAttribute("href"), "https://example.com");
  assert.equal(a.textContent, "build");
  assert.equal(root.querySelector("img"), null);
});

test("rewriteUrls does not alter elements outside the given root", () => {
  const { document } = new JSDOM('<body><a id="out" href="a.md">o</a><div id="in"><a href="a.md">i</a></div></body>').window;
  rewriteUrls(document.getElementById("in"), { src: SRC });
  assert.equal(document.getElementById("out").getAttribute("href"), "a.md");
  assert.equal(document.querySelector("#in a").getAttribute("href"), DIR + "a.md");
});
