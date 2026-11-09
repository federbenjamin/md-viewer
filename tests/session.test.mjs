import assert from "node:assert/strict";
import { test } from "node:test";

// session.js is a classic script: importing it runs it and publishes the global.
await import("../web/lib/session.js");
const { viewerQuery, readViewerQuery, staleIds } = globalThis.MDViewerSession;

const ID = "3f2b8c1e-5a4d-4e0b-9c7a-1d2e3f4a5b6c";

test("the session API is published as a frozen global", () => {
  assert.ok(Object.isFrozen(globalThis.MDViewerSession));
  assert.deepEqual(Object.keys(globalThis.MDViewerSession).sort(), ["readViewerQuery", "staleIds", "viewerQuery"]);
});

test("viewerQuery encodes id and src so the src's own ? & # cannot leak into the viewer's query", () => {
  const src = "https://example.com/a/b.md?x=1&y=2#top";
  assert.equal(viewerQuery(ID, src), `?id=${encodeURIComponent(ID)}&src=${encodeURIComponent(src)}`);
});

test("a src with a query string and a fragment survives the viewerQuery/readViewerQuery round trip", () => {
  const src = "https://example.com/docs/read me.md?token=a%20b&x=1&y=2#sec-3";
  const parsed = readViewerQuery(viewerQuery(ID, src));
  assert.deepEqual(parsed, { id: ID, src });
});

test("a plain https src round-trips, and so does an http one", () => {
  assert.equal(readViewerQuery(viewerQuery(ID, "https://h.example/x.md")).src, "https://h.example/x.md");
  assert.equal(readViewerQuery(viewerQuery(ID, "http://h.example/x.md")).src, "http://h.example/x.md");
});

for (const [name, bad] of [
  ["javascript:", "javascript:alert(1)"],
  ["data:", "data:text/html,<script>alert(1)</script>"],
  ["a relative path", "/docs/a.md"],
  ["a bare relative file", "a.md"],
  ["a non-http scheme", "ftp://h.example/a.md"],
  ["an extension page address", "safari-web-extension://abc/viewer/viewer.html"],
  ["an empty string", ""],
  ["a malformed URL", "http://"],
  ["whitespace", "   "],
]) {
  test(`readViewerQuery gives src null for ${name}`, () => {
    const result = readViewerQuery(`?id=${ID}&src=${encodeURIComponent(bad)}`);
    assert.equal(result.src, null);
    assert.equal(result.id, ID);
  });
}

test("readViewerQuery gives src null for a javascript: src whose scheme is cased or padded", () => {
  assert.equal(readViewerQuery(`?id=${ID}&src=${encodeURIComponent("JaVaScRiPt:alert(1)")}`).src, null);
  assert.equal(readViewerQuery(`?id=${ID}&src=${encodeURIComponent("  javascript:alert(1)")}`).src, null);
});

test("readViewerQuery gives src null when src is missing, and id null when id is missing", () => {
  assert.deepEqual(readViewerQuery(`?id=${ID}`), { id: ID, src: null });
  assert.deepEqual(readViewerQuery(`?src=${encodeURIComponent("https://h.example/a.md")}`), {
    id: null,
    src: "https://h.example/a.md",
  });
});

test("readViewerQuery on an empty search returns both null", () => {
  assert.deepEqual(readViewerQuery(""), { id: null, src: null });
  assert.deepEqual(readViewerQuery("?"), { id: null, src: null });
});

test("readViewerQuery never throws on malformed percent-encoding or an unencoded src", () => {
  assert.doesNotThrow(() => readViewerQuery("?id=%E0%A4%A&src=%"));
  assert.doesNotThrow(() => readViewerQuery("?src=http://[::1"));
  assert.equal(readViewerQuery("?src=%").src, null);
  assert.equal(readViewerQuery("?src=http://[::1").src, null);
});

// Entries are returned for removal; order is not part of the contract, so compare sorted.
const entries = (...ats) => Object.fromEntries(ats.map((at, i) => [`id${i}`, { at }]));

test("staleIds returns every id but the keep newest by at", () => {
  // at: id0=100 id1=500 id2=300 id3=200 id4=400; keep 2 -> newest are id1 (500), id4 (400)
  assert.deepEqual(staleIds(entries(100, 500, 300, 200, 400), 2).sort(), ["id0", "id2", "id3"]);
});

test("staleIds orders by at, not by key order", () => {
  const e = { z: { at: 1 }, a: { at: 3 }, m: { at: 2 } };
  assert.deepEqual(staleIds(e, 1).sort(), ["m", "z"]);
});

test("staleIds returns nothing when there are keep or fewer entries", () => {
  assert.deepEqual(staleIds(entries(1, 2, 3), 3), []);
  assert.deepEqual(staleIds(entries(1, 2), 3), []);
  assert.deepEqual(staleIds({}, 19), []);
});

test("staleIds with 20 entries and keep 19 evicts exactly the oldest, leaving room for the new one", () => {
  const e = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`e${i}`, { at: 1000 + i }]));
  assert.deepEqual(staleIds(e, 19), ["e0"]);
});

test("staleIds with keep 0 returns every id", () => {
  assert.deepEqual(staleIds(entries(1, 2, 3), 0).sort(), ["id0", "id1", "id2"]);
});

test("staleIds does not mutate its input", () => {
  const e = entries(3, 1, 2);
  const before = JSON.stringify(e);
  staleIds(e, 1);
  assert.equal(JSON.stringify(e), before);
});
