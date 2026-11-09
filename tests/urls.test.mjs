import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";
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

test("with src null a relative link keeps its href and its text", () => {
  const root = fragment('<a href="docs/a.md">next</a>');
  rewriteUrls(root, { src: null });
  assert.equal(root.querySelector("a").getAttribute("href"), "docs/a.md");
  assert.equal(root.textContent, "next");
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
