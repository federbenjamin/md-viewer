import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

// session.js is a classic script: importing it runs it and publishes the global.
await import("../web/lib/session.js");
const {
  viewerQuery,
  readViewerQuery,
  staleIds,
  isReturn,
  storeDocument,
  setTabMark,
  clearTabMark,
  readDocument,
  claimRedirect,
  settleRedirect,
} = globalThis.MDViewerSession;

const ID = "3f2b8c1e-5a4d-4e0b-9c7a-1d2e3f4a5b6c";

test("the session API is published as a frozen global", () => {
  assert.ok(Object.isFrozen(globalThis.MDViewerSession));
  assert.deepEqual(Object.keys(globalThis.MDViewerSession).sort(), [
    "claimRedirect",
    "clearTabMark",
    "isReturn",
    "readDocument",
    "readViewerQuery",
    "setTabMark",
    "settleRedirect",
    "staleIds",
    "storeDocument",
    "viewerQuery",
  ]);
});

const quotaError = () => Object.assign(new Error("exceeded storage quota"), { name: "Error" });

// In-memory storage.session; `failSets` holds what each successive set() throws (undefined means it succeeds).
function memoryStorage(initial = {}, failSets = []) {
  const data = { ...initial };
  const calls = { removed: [], sets: 0 };
  return {
    data,
    calls,
    async get(key) {
      if (key === null) return { ...data };
      return key in data ? { [key]: data[key] } : {};
    },
    async set(record) {
      const failure = failSets[calls.sets++];
      if (failure) throw failure;
      Object.assign(data, record);
    },
    async remove(ids) {
      calls.removed.push(...ids);
      for (const id of ids) delete data[id];
    },
  };
}

test("storeDocument writes the record under a fresh id and readDocument returns its text", async () => {
  const storage = memoryStorage();
  const { id } = await storeDocument(storage, "# hello");
  assert.deepEqual(Object.keys(storage.data), [id]);
  assert.equal(typeof storage.data[id].at, "number");
  assert.equal(await readDocument(storage, id), "# hello");
});

test("storeDocument evicts down to 19 before writing, so 20 documents remain", async () => {
  const initial = Object.fromEntries(Array.from({ length: 25 }, (_, i) => [`e${i}`, { text: "t", at: i + 1 }]));
  const storage = memoryStorage(initial);
  const { id } = await storeDocument(storage, "new");
  assert.equal(Object.keys(storage.data).length, 20);
  assert.ok(id in storage.data);
  assert.equal(storage.data.e0, undefined);
  assert.ok(storage.data.e24);
});

test("a first write that fails on quota clears the other documents and retries once", async () => {
  const storage = memoryStorage({ a: { text: "a", at: 1 }, b: { text: "b", at: 2 } }, [quotaError()]);
  const result = await storeDocument(storage, "big");
  assert.ok(result.id);
  assert.deepEqual(Object.keys(storage.data), [result.id]);
  assert.equal(storage.calls.sets, 2);
});

test("a QuotaExceededError by name is recognised whatever its message", async () => {
  const error = Object.assign(new Error("nope"), { name: "QuotaExceededError" });
  const storage = memoryStorage({ a: { text: "a", at: 1 } }, [error]);
  assert.ok((await storeDocument(storage, "big")).id);
  assert.deepEqual(storage.calls.removed, ["a"]);
});

test("a retry that also hits quota reports quota and writes nothing more", async () => {
  const storage = memoryStorage({ a: { text: "a", at: 1 } }, [quotaError(), quotaError()]);
  assert.deepEqual(await storeDocument(storage, "big"), { reason: "quota", errorName: "Error" });
  assert.equal(storage.calls.sets, 2);
});

test("a write failure that is not quota wipes nothing and does not retry", async () => {
  const storage = memoryStorage({ a: { text: "a", at: 1 } }, [new TypeError("could not clone")]);
  assert.deepEqual(await storeDocument(storage, "x"), { reason: "unavailable", errorName: "TypeError" });
  assert.deepEqual(storage.calls.removed, []);
  assert.equal(storage.calls.sets, 1);
  assert.ok(storage.data.a);
});

test("a storage read that rejects resolves to unavailable and writes nothing", async () => {
  const storage = memoryStorage();
  storage.get = async () => {
    throw new TypeError("no storage");
  };
  assert.deepEqual(await storeDocument(storage, "x"), { reason: "unavailable", errorName: "TypeError" });
  assert.equal(storage.calls.sets, 0);
});

const DOC = "https://h.example/a.md";
const MARK = "mdviewer-tab:7";

test("isReturn holds only for the src last sent to the viewer from that same tab", () => {
  const entries = { [MARK]: DOC };
  assert.equal(isReturn(entries, 7, DOC), true);
  assert.equal(isReturn(entries, 7, "https://h.example/b.md"), false);
  assert.equal(isReturn(entries, 8, DOC), false);
  assert.equal(isReturn(entries, undefined, DOC), false);
  assert.equal(isReturn({}, 7, DOC), false);
});

test("storeDocument from a tab stores the document and marks the tab with its src", async () => {
  const storage = memoryStorage();
  const { id } = await storeDocument(storage, "# a", DOC, 7);
  assert.deepEqual(Object.keys(storage.data).sort(), [MARK, id].sort());
  assert.equal(storage.data[MARK], DOC);
});

test("storeDocument for the src the tab is marked with is a return: it stores nothing and clears the mark", async () => {
  const storage = memoryStorage({ [MARK]: DOC });
  assert.deepEqual(await storeDocument(storage, "# a", DOC, 7), { returned: true });
  assert.deepEqual(storage.data, {});
  assert.ok((await storeDocument(storage, "# a", DOC, 7)).id);
});

test("storeDocument for a different src in the same tab stores it and moves the mark", async () => {
  const storage = memoryStorage({ [MARK]: DOC });
  const { id } = await storeDocument(storage, "# b", "https://h.example/b.md", 7);
  assert.ok(id);
  assert.equal(storage.data[MARK], "https://h.example/b.md");
});

test("storeDocument with no tab id stores as before and leaves every mark alone", async () => {
  const storage = memoryStorage({ [MARK]: DOC });
  const { id } = await storeDocument(storage, "# a", DOC, undefined);
  assert.deepEqual(Object.keys(storage.data).sort(), [MARK, id].sort());
  assert.equal(storage.data[MARK], DOC);
});

test("setTabMark marks the tab with the src, so the next store of that src from the tab is a return", async () => {
  const storage = memoryStorage({ [MARK]: "https://h.example/b.md", doc: { text: "t", at: 1 } });
  await setTabMark(storage, 7, DOC);
  assert.equal(storage.data[MARK], DOC);
  assert.ok(storage.data.doc);
  assert.deepEqual(await storeDocument(storage, "# a", DOC, 7), { returned: true });
});

test("setTabMark does nothing without a tab id or a string src, and resolves when the write fails", async () => {
  const storage = memoryStorage();
  await setTabMark(storage, undefined, DOC);
  await setTabMark(storage, 7, undefined);
  assert.deepEqual(storage.data, {});
  assert.equal(storage.calls.sets, 0);
  const failing = memoryStorage({}, [new Error("broken")]);
  await assert.doesNotReject(setTabMark(failing, 7, DOC));
});

test("clearTabMark removes only that tab's mark, and does nothing without a tab id", async () => {
  const storage = memoryStorage({ [MARK]: DOC, "mdviewer-tab:8": DOC, doc: { text: "t", at: 1 } });
  await clearTabMark(storage, undefined);
  assert.equal(Object.keys(storage.data).length, 3);
  await clearTabMark(storage, 7);
  assert.deepEqual(Object.keys(storage.data).sort(), ["doc", "mdviewer-tab:8"]);
  assert.ok((await storeDocument(storage, "# a", DOC, 7)).id);
});

test("clearTabMark resolves even when the removal fails", async () => {
  const storage = memoryStorage({ [MARK]: DOC });
  storage.remove = async () => {
    throw new Error("broken");
  };
  await assert.doesNotReject(clearTabMark(storage, 7));
});

test("marks neither count toward nor fall to eviction, so 20 documents remain beside them", async () => {
  const marks = Object.fromEntries(Array.from({ length: 5 }, (_, i) => [`mdviewer-tab:${i}`, DOC]));
  const docs = Object.fromEntries(Array.from({ length: 25 }, (_, i) => [`e${i}`, { text: "t", at: i + 1 }]));
  const storage = memoryStorage({ ...marks, ...docs });
  await storeDocument(storage, "new", "https://h.example/new.md", 9);
  const keys = Object.keys(storage.data);
  assert.equal(keys.filter((key) => !key.startsWith("mdviewer-tab:")).length, 20);
  for (const key of Object.keys(marks)) assert.equal(storage.data[key], DOC);
  assert.equal(storage.data["mdviewer-tab:9"], "https://h.example/new.md");
});

test("a quota retry clears the other documents but keeps the marks", async () => {
  const storage = memoryStorage({ a: { text: "a", at: 1 }, "mdviewer-tab:3": DOC }, [quotaError()]);
  const { id } = await storeDocument(storage, "big", "https://h.example/new.md", 9);
  assert.deepEqual(Object.keys(storage.data).sort(), ["mdviewer-tab:3", "mdviewer-tab:9", id].sort());
});

test("staleIds never returns a mark", () => {
  assert.deepEqual(staleIds({ [MARK]: DOC, a: { at: 1 }, b: { at: 2 } }, 0).sort(), ["a", "b"]);
});

test("readDocument tells an empty document from an absent or malformed entry", async () => {
  const storage = memoryStorage({ empty: { text: "", at: 1 }, noText: { at: 1 }, wrong: { text: 5, at: 1 } });
  assert.equal(await readDocument(storage, "empty"), "");
  assert.equal(await readDocument(storage, "absent"), null);
  assert.equal(await readDocument(storage, "noText"), null);
  assert.equal(await readDocument(storage, "wrong"), null);
});

test("a read that rejects is not reported as a missing document", async () => {
  const storage = memoryStorage();
  storage.get = async () => {
    throw new Error("broken");
  };
  await assert.rejects(readDocument(storage, "x"));
});

for (const file of ["web/background.js", "web/content.js", "web/viewer/source.js", "web/viewer/viewer.js", "web/viewer/assets.js"]) {
  test(`${file} never touches storage.session's methods: session.js owns the stored record`, async () => {
    const code = await readFile(new URL(`../${file}`, import.meta.url), "utf8");
    assert.doesNotMatch(code, /storage\.session\.(get|set|remove)\b/);
  });
}

function tabWindow() {
  const items = new Map();
  return {
    items,
    sessionStorage: {
      getItem: (key) => (items.has(key) ? items.get(key) : null),
      setItem: (key, value) => void items.set(key, value),
      removeItem: (key) => void items.delete(key),
    },
  };
}

const PAGE = "https://h.example/a.md";

test("claimRedirect allows one hop per src, then refuses, then allows a fresh try", () => {
  const window = tabWindow();
  assert.equal(claimRedirect(window, PAGE), true);
  assert.equal(claimRedirect(window, PAGE), false);
  assert.equal(window.items.size, 0);
  assert.equal(claimRedirect(window, PAGE), true);
});

test("claimRedirect keeps a separate allowance for each src", () => {
  const window = tabWindow();
  assert.equal(claimRedirect(window, PAGE), true);
  assert.equal(claimRedirect(window, "https://h.example/b.md"), true);
});

test("settleRedirect clears the claim, so a later miss may hop again", () => {
  const window = tabWindow();
  claimRedirect(window, PAGE);
  settleRedirect(window, PAGE);
  assert.equal(claimRedirect(window, PAGE), true);
});

test("claimRedirect refuses when session storage cannot be used, so the hop cannot loop", () => {
  const throwing = {
    get sessionStorage() {
      throw new Error("denied");
    },
  };
  assert.equal(claimRedirect(throwing, PAGE), false);
  assert.doesNotThrow(() => settleRedirect(throwing, PAGE));
  const fullStorage = tabWindow();
  fullStorage.sessionStorage.setItem = () => {
    throw new Error("full");
  };
  assert.equal(claimRedirect(fullStorage, PAGE), false);
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

// Observed behavior, not in the brief: an empty id counts as absent, so the viewer reports
// "missing" instead of reading storage with an empty key.
test("readViewerQuery treats an empty id value as no id", () => {
  assert.equal(readViewerQuery("?id=&src=").id, null);
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
