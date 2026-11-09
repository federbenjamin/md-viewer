import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import { loadLibraries } from "../web/viewer/assets.js";

function freshDocument() {
  const { window } = new JSDOM("<!doctype html><head></head>", { url: "https://ext.test/viewer/viewer.html" });
  globalThis.document = window.document;
  return window;
}

const appended = (window) => [...window.document.head.children];
const settle = (window, element, type) => element.dispatchEvent(new window.Event(type));

test("loadLibraries appends nothing and resolves when no library is wanted", async () => {
  const window = freshDocument();
  await loadLibraries({ highlight: false, math: false, mermaid: false });
  assert.equal(appended(window).length, 0);
});

test("highlight appends its script and both stylesheets, the dark one with its media query", async () => {
  const window = freshDocument();
  const done = loadLibraries({ highlight: true, math: false, mermaid: false });
  const [script, light, dark] = appended(window);
  assert.equal(script.getAttribute("src"), "../vendor/highlight.min.js");
  assert.equal(light.getAttribute("href"), "../vendor/hljs-github.min.css");
  assert.equal(light.rel, "stylesheet");
  assert.equal(dark.getAttribute("href"), "../vendor/hljs-github-dark.min.css");
  assert.equal(dark.media, "(prefers-color-scheme: dark)");
  for (const element of appended(window)) settle(window, element, "load");
  await done;
});

test("math and mermaid append only their own files", async () => {
  const window = freshDocument();
  const done = loadLibraries({ highlight: false, math: true, mermaid: true });
  assert.deepEqual(
    appended(window).map((el) => el.getAttribute("src") ?? el.getAttribute("href")),
    ["../vendor/katex.min.js", "../vendor/katex.min.css", "../vendor/mermaid.min.js"],
  );
  for (const element of appended(window)) settle(window, element, "load");
  await done;
});

test("a file that fails to load is reported by library and class, and the other files still finish", async (t) => {
  const warn = t.mock.method(console, "warn", () => {});
  const window = freshDocument();
  const done = loadLibraries({ highlight: false, math: true, mermaid: true });
  const [katexScript, katexStyle, mermaidScript] = appended(window);
  settle(window, katexScript, "error");
  settle(window, katexStyle, "load");
  settle(window, mermaidScript, "error");
  await done;
  assert.deepEqual(
    warn.mock.calls.map((call) => call.arguments.join(" ")),
    ["mdviewer: loading katex failed: Error", "mdviewer: loading mermaid failed: Error"],
  );
});

test("nothing is reported when every file loads", async (t) => {
  const warn = t.mock.method(console, "warn", () => {});
  const window = freshDocument();
  const done = loadLibraries({ highlight: false, math: false, mermaid: true });
  settle(window, appended(window)[0], "load");
  await done;
  assert.equal(warn.mock.calls.length, 0);
});
