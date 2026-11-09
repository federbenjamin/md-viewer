browser.runtime.onMessage.addListener((message) => {
  if (message?.type !== "store") return undefined;
  const { text, src } = message;
  if (typeof text !== "string" || typeof src !== "string") {
    return Promise.resolve({ error: "store-failed", reason: "invalid" });
  }
  return MDViewerSession.storeDocument(browser.storage.session, text).then((result) => {
    if (result.id) return { url: browser.runtime.getURL("viewer/viewer.html") + MDViewerSession.viewerQuery(result.id, src) };
    console.error("mdviewer: store failed:", result.errorName);
    return { error: "store-failed", reason: result.reason };
  });
});
