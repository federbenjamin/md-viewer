browser.runtime.onMessage.addListener((message, sender) => {
  const tabId = sender?.tab?.id;
  if (message?.type === "mark") {
    return MDViewerSession.setTabMark(browser.storage.session, tabId, message.src).then(() => ({}));
  }
  if (message?.type === "clear-mark") {
    return MDViewerSession.clearTabMark(browser.storage.session, tabId).then(() => ({}));
  }
  if (message?.type !== "store") return undefined;
  const { text, src } = message;
  if (typeof text !== "string" || typeof src !== "string") {
    return Promise.resolve({ reason: "invalid" });
  }
  return MDViewerSession.storeDocument(browser.storage.session, text, src, tabId).then((result) => {
    if (result.returned) return { reason: "returned" };
    if (result.id) return { url: browser.runtime.getURL("viewer/viewer.html") + MDViewerSession.viewerQuery(result.id, src) };
    console.error("mdviewer: store failed:", result.errorName);
    return { reason: result.reason };
  });
});
