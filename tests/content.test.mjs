import assert from "node:assert/strict";
import { test } from "node:test";

await import("../web/lib/detect.js");

let run = 0;
const URL_MD = "https://h.example/a.md";

// Runs the real content script and resolves once it has sent its message and acted on the outcome.
async function runContent(sendMessage) {
  const replaced = [];
  globalThis.location = { href: URL_MD, replace: (url) => replaced.push(url) };
  globalThis.document = { contentType: "text/plain", characterSet: "UTF-8", body: { textContent: "# hi" } };
  let sent;
  const answered = new Promise((resolve) => {
    globalThis.browser = {
      runtime: {
        sendMessage: (message) => {
          sent = message;
          const outcome = sendMessage();
          outcome.then(resolve, resolve);
          return outcome;
        },
      },
    };
  });
  await import(`../web/content.js?run=${run++}`);
  await answered;
  await new Promise((resolve) => setImmediate(resolve));
  return { replaced, sent };
}

test("a reply with a url navigates there and warns of nothing", async (t) => {
  const warn = t.mock.method(console, "warn", () => {});
  const { replaced, sent } = await runContent(async () => ({ url: "safari-web-extension://x/viewer.html" }));
  assert.deepEqual(sent, { type: "store", text: "# hi", src: URL_MD });
  assert.deepEqual(replaced, ["safari-web-extension://x/viewer.html"]);
  assert.equal(warn.mock.calls.length, 0);
});

for (const reason of ["invalid", "quota", "unavailable"]) {
  test(`a ${reason} failure logs the reason and leaves the raw page`, async (t) => {
    const warn = t.mock.method(console, "warn", () => {});
    const { replaced } = await runContent(async () => ({ reason }));
    assert.deepEqual(replaced, []);
    assert.deepEqual(
      warn.mock.calls.map((call) => call.arguments),
      [["mdviewer: store failed:", reason]],
    );
  });
}

test("no reply at all is logged and leaves the raw page", async (t) => {
  const warn = t.mock.method(console, "warn", () => {});
  const { replaced } = await runContent(async () => undefined);
  assert.deepEqual(replaced, []);
  assert.deepEqual(
    warn.mock.calls.map((call) => call.arguments),
    [["mdviewer: store failed:", "no-reply"]],
  );
});

test("a rejected message logs the error's class only and leaves the raw page", async (t) => {
  const warn = t.mock.method(console, "warn", () => {});
  const { replaced } = await runContent(() => Promise.reject(new TypeError("# hi from the document")));
  assert.deepEqual(replaced, []);
  assert.deepEqual(
    warn.mock.calls.map((call) => call.arguments),
    [["mdviewer: store failed:", "TypeError"]],
  );
});
