(async function () {
  const { shouldRender, needsUtf8Decode, decodeUtf8 } = globalThis.MDViewerDetect;
  if (!shouldRender({ url: location.href, contentType: document.contentType })) return;

  let text = document.body?.textContent ?? "";
  // A response with no charset is decoded as windows-1252; re-read the bytes as UTF-8 (device probe 2026-11-09).
  if (needsUtf8Decode(document.characterSet)) {
    try {
      const response = await fetch(location.href);
      if (response.ok) {
        const decoded = decodeUtf8(await response.arrayBuffer());
        if (decoded !== null) text = decoded;
      }
    } catch {
      // The page's own text stays the source.
    }
  }

  let reply;
  try {
    reply = await browser.runtime.sendMessage({ type: "store", text, src: location.href });
  } catch {
    return;
  }
  // Only a stored document navigates: on an error the raw page stays, so the viewer-to-src path cannot loop.
  if (reply && typeof reply.url === "string") location.replace(reply.url);
})();
