// Classic script: the content script cannot import a module, so this publishes one frozen global.
(function () {
  const MARKDOWN_TYPES = Object.freeze(["text/plain", "text/markdown", "text/x-markdown"]);
  const MARKDOWN_PATH = /\.(?:md|markdown)$/i;

  function shouldRender({ url, contentType }) {
    let pathname;
    try {
      pathname = new URL(url).pathname;
    } catch {
      return false;
    }
    return MARKDOWN_PATH.test(pathname) && MARKDOWN_TYPES.includes(contentType);
  }

  function needsUtf8Decode(characterSet) {
    return String(characterSet).toLowerCase() !== "utf-8";
  }

  function decodeUtf8(bytes) {
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      return null;
    }
  }

  globalThis.MDViewerDetect = Object.freeze({ MARKDOWN_TYPES, shouldRender, needsUtf8Decode, decodeUtf8 });
})();
