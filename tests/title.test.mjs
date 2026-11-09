import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import { documentTitle } from "../web/lib/title.js";

const rootFor = (html) => new JSDOM(`<main id="root">${html}</main>`).window.document.getElementById("root");

test("the first h1's trimmed text is the title", () => {
  assert.equal(documentTitle(rootFor("<h1>  One </h1><h1>Two</h1>"), "https://h.example/a.md"), "One");
});

test("with no h1 the title is the src's last path segment, decoded", () => {
  assert.equal(documentTitle(rootFor("<p>x</p>"), "https://h.example/docs/read%20me.md?x=1#t"), "read me.md");
});

test("an empty h1 falls through to the path segment", () => {
  assert.equal(documentTitle(rootFor("<h1>   </h1>"), "https://h.example/a.md"), "a.md");
});

test("a malformed percent-encoding keeps the raw segment instead of throwing", () => {
  assert.equal(documentTitle(rootFor(""), "https://h.example/100%.md"), "100%.md");
});

test("with no h1 and no src the title is Markdown", () => {
  assert.equal(documentTitle(rootFor(""), null), "Markdown");
});

test("a src with no path segment falls back to Markdown", () => {
  assert.equal(documentTitle(rootFor(""), "https://h.example/"), "Markdown");
});
