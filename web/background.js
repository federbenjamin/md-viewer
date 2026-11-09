// storage.session holds 10 MB in all; the newest documents stay.
const KEEP_BEFORE_WRITE = 19;

async function writeDocument(id, text) {
  await browser.storage.session.set({ [id]: { text, at: Date.now() } });
}

async function store(text) {
  const id = crypto.randomUUID();
  const entries = await browser.storage.session.get(null);
  const stale = MDViewerSession.staleIds(entries, KEEP_BEFORE_WRITE);
  if (stale.length > 0) await browser.storage.session.remove(stale);
  try {
    await writeDocument(id, text);
  } catch {
    // Safari's quota error has no stable name to match, so any failed write clears the rest and retries once.
    const others = Object.keys(await browser.storage.session.get(null)).filter((key) => key !== id);
    if (others.length > 0) await browser.storage.session.remove(others);
    await writeDocument(id, text);
  }
  return id;
}

browser.runtime.onMessage.addListener((message) => {
  if (message?.type !== "store") return undefined;
  const { text, src } = message;
  if (typeof text !== "string" || typeof src !== "string") return Promise.resolve({ error: "store-failed" });
  return store(text).then(
    (id) => ({ url: browser.runtime.getURL("viewer/viewer.html") + MDViewerSession.viewerQuery(id, src) }),
    () => ({ error: "store-failed" }),
  );
});
