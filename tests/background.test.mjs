import assert from "node:assert/strict";
import { test } from "node:test";

await import("../web/lib/session.js");

let run = 0;

async function loadListener(storage) {
  let listener;
  globalThis.browser = {
    storage: { session: storage },
    runtime: {
      getURL: (path) => `safari-web-extension://x/${path}`,
      onMessage: { addListener: (fn) => (listener = fn) },
    },
  };
  await import(`../web/background.js?run=${run++}`);
  return listener;
}

function storageWith(initial, setImpl) {
  const data = { ...initial };
  return {
    data,
    get: async (key) => (key === null ? { ...data } : { [key]: data[key] }),
    set: setImpl ?? (async (record) => void Object.assign(data, record)),
    remove: async (ids) => ids.forEach((id) => delete data[id]),
  };
}

const SRC = "https://h.example/a.md";
const STORE = { type: "store", text: "# hi", src: SRC };

test("a stored document replies with the viewer's address and logs nothing", async (t) => {
  const error = t.mock.method(console, "error", () => {});
  const storage = storageWith({});
  const listener = await loadListener(storage);
  const reply = await listener(STORE);
  const [id] = Object.keys(storage.data);
  assert.equal(
    reply.url,
    `safari-web-extension://x/viewer/viewer.html?id=${encodeURIComponent(id)}&src=${encodeURIComponent(SRC)}`,
  );
  assert.equal(error.mock.calls.length, 0);
});

test("a message that is not a store request gets no reply", async () => {
  const listener = await loadListener(storageWith({}));
  assert.equal(listener({ type: "other" }), undefined);
  assert.equal(listener(undefined), undefined);
});

test("a store request with a missing text or src replies invalid and writes nothing", async () => {
  const storage = storageWith({});
  const listener = await loadListener(storage);
  assert.deepEqual(await listener({ type: "store", text: 5, src: SRC }), { error: "store-failed", reason: "invalid" });
  assert.deepEqual(await listener({ type: "store", text: "x" }), { error: "store-failed", reason: "invalid" });
  assert.deepEqual(storage.data, {});
});

test("a non-quota write failure keeps the other documents, replies unavailable and logs only the class", async (t) => {
  const error = t.mock.method(console, "error", () => {});
  const other = { text: "other", at: 1 };
  const storage = storageWith({ other }, async () => {
    throw new TypeError("fragment of the document");
  });
  const listener = await loadListener(storage);
  assert.deepEqual(await listener(STORE), { error: "store-failed", reason: "unavailable" });
  assert.deepEqual(storage.data, { other });
  assert.deepEqual(
    error.mock.calls.map((call) => call.arguments),
    [["mdviewer: store failed:", "TypeError"]],
  );
});

test("a quota failure on every write replies quota", async (t) => {
  t.mock.method(console, "error", () => {});
  const storage = storageWith({ other: { text: "o", at: 1 } }, async () => {
    throw new Error("exceeded storage quota");
  });
  const listener = await loadListener(storage);
  assert.deepEqual(await listener(STORE), { error: "store-failed", reason: "quota" });
  assert.deepEqual(storage.data, {});
});

test("a read that fails replies unavailable", async (t) => {
  t.mock.method(console, "error", () => {});
  const storage = storageWith({});
  storage.get = async () => {
    throw new Error("storage unavailable");
  };
  const listener = await loadListener(storage);
  assert.deepEqual(await listener(STORE), { error: "store-failed", reason: "unavailable" });
});
