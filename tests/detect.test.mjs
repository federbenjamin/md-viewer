import assert from "node:assert/strict";
import { test } from "node:test";

import "../web/lib/detect.js";

const detect = globalThis.MDViewerDetect;
const { MARKDOWN_TYPES, shouldRender, needsUtf8Decode, decodeUtf8 } = detect;

const bytes = (...values) => Uint8Array.from(values).buffer;

test("detect.js publishes one frozen global with the four members", () => {
  assert.ok(Object.isFrozen(detect));
  assert.deepEqual(Object.keys(detect).sort(), ["MARKDOWN_TYPES", "decodeUtf8", "needsUtf8Decode", "shouldRender"]);
  assert.deepEqual([...MARKDOWN_TYPES], ["text/plain", "text/markdown", "text/x-markdown"]);
});

test("a raw GitHub README served as text/plain renders", () => {
  assert.equal(
    shouldRender({ url: "https://raw.githubusercontent.com/o/r/main/README.md", contentType: "text/plain" }),
    true,
  );
});

test("each listed markdown type renders on a .md path", () => {
  for (const contentType of ["text/plain", "text/markdown", "text/x-markdown"]) {
    assert.equal(shouldRender({ url: "https://h/x.md", contentType }), true, contentType);
  }
});

test("GitHub's HTML file view of a .md path stays untouched", () => {
  assert.equal(
    shouldRender({ url: "https://github.com/o/r/blob/main/README.md", contentType: "text/html" }),
    false,
  );
});

test("the .markdown extension renders", () => {
  assert.equal(shouldRender({ url: "https://h/notes.markdown", contentType: "text/markdown" }), true);
});

test("a query string or fragment does not hide the extension", () => {
  assert.equal(shouldRender({ url: "https://h/x.md?token=1", contentType: "text/plain" }), true);
  assert.equal(shouldRender({ url: "https://h/x.md#top", contentType: "text/plain" }), true);
  assert.equal(shouldRender({ url: "https://h/x.md?token=1#top", contentType: "text/plain" }), true);
});

test("an extension that appears only in the query or fragment does not render", () => {
  // Matching on the whole href instead of the pathname would pass these.
  assert.equal(shouldRender({ url: "https://h/page?file=x.md", contentType: "text/plain" }), false);
  assert.equal(shouldRender({ url: "https://h/page#x.md", contentType: "text/plain" }), false);
  assert.equal(shouldRender({ url: "https://h/x.md/", contentType: "text/plain" }), false);
});

test("the extension match is case-insensitive", () => {
  assert.equal(shouldRender({ url: "https://h/README.MD", contentType: "text/plain" }), true);
  assert.equal(shouldRender({ url: "https://h/Notes.Markdown", contentType: "text/plain" }), true);
});

test("a .md path with a non-markdown type does not render", () => {
  for (const contentType of ["text/html", "application/json", "application/octet-stream", "image/png", ""]) {
    assert.equal(shouldRender({ url: "https://h/x.md", contentType }), false, contentType);
  }
});

test("a listed type on a non-.md path does not render", () => {
  for (const url of ["https://h/x.txt", "https://h/x", "https://h/", "https://h/x.mdx", "https://h/xmd", "https://h/x.markdown.txt"]) {
    assert.equal(shouldRender({ url, contentType: "text/plain" }), false, url);
  }
});

test("the content type must match exactly, with no charset suffix or lookalike", () => {
  assert.equal(shouldRender({ url: "https://h/x.md", contentType: "text/plain; charset=utf-8" }), false);
  assert.equal(shouldRender({ url: "https://h/x.md", contentType: "text/plainx" }), false);
  assert.equal(shouldRender({ url: "https://h/x.md", contentType: "xtext/plain" }), false);
});

test("needsUtf8Decode is false for UTF-8 in any letter case", () => {
  for (const name of ["UTF-8", "utf-8", "Utf-8"]) {
    assert.equal(needsUtf8Decode(name), false, name);
  }
});

test("needsUtf8Decode is true for windows-1252 and other charsets", () => {
  for (const name of ["windows-1252", "ISO-8859-1", "UTF-16LE", "Shift_JIS"]) {
    assert.equal(needsUtf8Decode(name), true, name);
  }
});

test("decodeUtf8 decodes valid multi-byte UTF-8", () => {
  // "é" = C3 A9, "✓" = E2 9C 93 (UTF-8 encodings from the Unicode standard).
  assert.equal(decodeUtf8(bytes(0x68, 0xc3, 0xa9, 0x20, 0xe2, 0x9c, 0x93)), "hé ✓");
});

test("decodeUtf8 returns the character count a windows-1252 read would inflate", () => {
  // The device probe saw 12 characters arrive as 21 under windows-1252.
  const text = "héllo wörld ✓";
  const encoded = new TextEncoder().encode(text);
  const decoded = decodeUtf8(encoded.buffer);
  assert.equal(decoded, text);
  assert.ok(encoded.length > text.length);
});

test("decodeUtf8 decodes an empty buffer to an empty string", () => {
  assert.equal(decodeUtf8(new ArrayBuffer(0)), "");
});

test("decodeUtf8 returns null for invalid UTF-8 instead of substituting", () => {
  assert.equal(decodeUtf8(bytes(0xff, 0xfe, 0x41)), null);
  // Truncated three-byte sequence.
  assert.equal(decodeUtf8(bytes(0x41, 0xe2, 0x9c)), null);
  // Lone continuation byte.
  assert.equal(decodeUtf8(bytes(0x80)), null);
});
