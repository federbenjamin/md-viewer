import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { JSDOM } from "jsdom";

const html = await readFile(new URL("../web/viewer/viewer.html", import.meta.url), "utf8");
const SRC = "https://h.example/a.md";
const UNAVAILABLE = "This document is no longer available.";
const RENDER_FAILED = "This document could not be displayed. The Raw button shows its source.";

let run = 0;

function newTab() {
  return new JSDOM(html, { url: "https://ext.test/viewer/viewer.html" });
}

function resetPage(dom) {
  const { document } = dom.window;
  document.getElementById("content").replaceChildren();
  const raw = document.getElementById("raw");
  raw.replaceWith(raw.cloneNode(true));
}

// One load of the real viewer page in `dom`'s tab. Resolves when the viewer has navigated, shown a message, or enabled Raw.
async function loadViewer(dom, { stored = {}, id = "doc", src = SRC, assetEvent = "load" } = {}) {
  resetPage(dom);
  const { window } = dom;
  const replaced = [];
  const settled = new Set(window.document.head.children);
  globalThis.window = window;
  globalThis.document = window.document;
  globalThis.matchMedia = () => ({ matches: false });
  globalThis.location = {
    search: `?id=${id}&src=${encodeURIComponent(src)}`,
    replace: (url) => replaced.push(url),
  };
  globalThis.browser = {
    runtime: { id: "ext" },
    storage: { session: { get: async (key) => (key in stored ? { [key]: stored[key] } : {}) } },
  };

  await import(`../web/viewer/viewer.js?run=${run++}`);

  const content = window.document.getElementById("content");
  const raw = window.document.getElementById("raw");
  for (let tick = 0; tick < 2000; tick++) {
    if (replaced.length > 0 || !raw.disabled) break;
    if (content.textContent === UNAVAILABLE) break;
    for (const element of window.document.head.children) {
      if (settled.has(element)) continue;
      settled.add(element);
      element.dispatchEvent(new window.Event(assetEvent));
    }
    await new Promise((resolve) => setImmediate(resolve));
  }
  return { replaced, content, raw };
}

const failRendering = (dom) => {
  Object.defineProperty(dom.window.document.getElementById("content"), "innerHTML", {
    set() {
      throw new TypeError("private text of the document");
    },
  });
};

test("a document renders, gets its title and enables Raw", async () => {
  const dom = newTab();
  const { content, raw, replaced } = await loadViewer(dom, { stored: { doc: { text: "# Hello", at: 1 } } });
  assert.equal(content.querySelector("h1").textContent, "Hello");
  assert.equal(dom.window.document.title, "Hello");
  assert.equal(raw.disabled, false);
  assert.deepEqual(replaced, []);
});

test("a render that throws shows a message, enables Raw and logs the class only", async (t) => {
  const error = t.mock.method(console, "error", () => {});
  const dom = newTab();
  failRendering(dom);
  const { content, raw } = await loadViewer(dom, { stored: { doc: { text: "# Hello <raw>", at: 1 } } });
  assert.equal(content.textContent, RENDER_FAILED);
  assert.equal(raw.disabled, false);
  assert.deepEqual(
    error.mock.calls.map((call) => call.arguments),
    [["mdviewer: rendering failed:", "TypeError"]],
  );
  raw.click();
  assert.equal(content.querySelector("#source").textContent, "# Hello <raw>");
  raw.click();
  assert.equal(content.textContent, RENDER_FAILED);
});

test("a library that fails to load leaves the rendered document, is reported, and enables Raw", async (t) => {
  const warn = t.mock.method(console, "warn", () => {});
  const error = t.mock.method(console, "error", () => {});
  const dom = newTab();
  const text = "# Title\n\n```js\nlet a;\n```\n";
  const { content, raw } = await loadViewer(dom, { stored: { doc: { text, at: 1 } }, assetEvent: "error" });
  assert.equal(content.querySelector("h1").textContent, "Title");
  assert.equal(content.querySelector("pre code").textContent.trim(), "let a;");
  assert.equal(raw.disabled, false);
  assert.equal(error.mock.calls.length, 0);
  assert.ok(warn.mock.calls.length > 0);
  assert.ok(warn.mock.calls.every((call) => call.arguments.join(" ") === "mdviewer: loading highlight.js failed: Error"));
});

test("an empty document is told apart from a failed render", async (t) => {
  const error = t.mock.method(console, "error", () => {});
  const dom = newTab();
  const { content, raw, replaced } = await loadViewer(dom, { stored: { doc: { text: "", at: 1 } } });
  assert.equal(content.textContent, "");
  assert.equal(raw.disabled, false);
  assert.deepEqual(replaced, []);
  assert.equal(error.mock.calls.length, 0);
});

for (const [name, stored] of [
  ["an absent entry", {}],
  ["an entry with no text", { doc: { at: 1 } }],
  ["an entry whose text is not a string", { doc: { text: 7, at: 1 } }],
]) {
  test(`${name} hops to src once and the second miss stays on the viewer`, async () => {
    const dom = newTab();
    const first = await loadViewer(dom, { stored });
    assert.deepEqual(first.replaced, [SRC]);
    const second = await loadViewer(dom, { stored });
    assert.deepEqual(second.replaced, []);
    assert.equal(second.content.textContent, UNAVAILABLE);
  });
}

test("a store that reads back empty on every return ends after one hop", async () => {
  const dom = newTab();
  const hops = [];
  for (let visit = 0; visit < 6; visit++) {
    const { replaced } = await loadViewer(dom);
    if (replaced.length === 0) break;
    hops.push(...replaced);
  }
  assert.deepEqual(hops, [SRC]);
});

test("a successful read clears the claim, so a later miss may hop again", async () => {
  const dom = newTab();
  await loadViewer(dom);
  await loadViewer(dom, { stored: { doc: { text: "# Back", at: 1 } } });
  const later = await loadViewer(dom);
  assert.deepEqual(later.replaced, [SRC]);
});

test("a second document in the same tab has its own hop", async () => {
  const dom = newTab();
  await loadViewer(dom);
  const other = await loadViewer(dom, { src: "https://h.example/b.md" });
  assert.deepEqual(other.replaced, ["https://h.example/b.md"]);
});

test("a storage read that throws shows the unavailable message and does not hop", async (t) => {
  const error = t.mock.method(console, "error", () => {});
  const dom = newTab();
  const stored = new Proxy(
    {},
    {
      has() {
        throw new RangeError("storage failed");
      },
    },
  );
  const { replaced, content } = await loadViewer(dom, { stored });
  assert.deepEqual(replaced, []);
  assert.equal(content.textContent, UNAVAILABLE);
  assert.deepEqual(
    error.mock.calls.map((call) => call.arguments),
    [["mdviewer: reading the document failed:", "RangeError"]],
  );
});
