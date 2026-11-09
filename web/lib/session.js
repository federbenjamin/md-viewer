// Classic script: the background page lists it before background.js, so this publishes one frozen global.
(function () {
  // storage.session holds 10 MB in all; the newest documents stay.
  const KEEP_BEFORE_WRITE = 19;
  const REDIRECT_MARKER = "mdviewer-src-redirect:";

  function viewerQuery(id, src) {
    return "?id=" + encodeURIComponent(id) + "&src=" + encodeURIComponent(src);
  }

  function httpUrlOrNull(value) {
    if (!value) return null;
    try {
      const { protocol } = new URL(value);
      return protocol === "http:" || protocol === "https:" ? value : null;
    } catch {
      return null;
    }
  }

  function readViewerQuery(search) {
    const params = new URLSearchParams(search);
    return { id: params.get("id") || null, src: httpUrlOrNull(params.get("src")) };
  }

  function staleIds(entries, keep) {
    return Object.entries(entries)
      .sort(([, a], [, b]) => (Number(b?.at) || 0) - (Number(a?.at) || 0))
      .slice(Math.max(0, keep))
      .map(([id]) => id);
  }

  // Browsers disagree on the quota error's name, so the message is read too; it is never logged.
  function isQuotaError(error) {
    return error?.name === "QuotaExceededError" || /quota/i.test(String(error?.message ?? ""));
  }

  async function writeOrMakeRoom(storage, id, record) {
    try {
      await storage.set(record);
    } catch (error) {
      if (!isQuotaError(error)) throw error;
      const others = Object.keys(await storage.get(null)).filter((key) => key !== id);
      if (others.length > 0) await storage.remove(others);
      await storage.set(record);
    }
  }

  // Resolves to { id } or { reason, errorName }; it never rejects.
  async function storeDocument(storage, text) {
    const id = crypto.randomUUID();
    try {
      const stale = staleIds(await storage.get(null), KEEP_BEFORE_WRITE);
      if (stale.length > 0) await storage.remove(stale);
      await writeOrMakeRoom(storage, id, { [id]: { text, at: Date.now() } });
      return { id };
    } catch (error) {
      return { reason: isQuotaError(error) ? "quota" : "unavailable", errorName: error?.name ?? "unknown" };
    }
  }

  // The document's text, or null when the entry is absent or is not a stored document. An empty document is "".
  async function readDocument(storage, id) {
    const stored = await storage.get(id);
    const text = stored?.[id]?.text;
    return typeof text === "string" ? text : null;
  }

  // Whether the viewer may hop to `src` after a miss: once per tab and src, so viewer -> page -> viewer cannot loop.
  // Storage that cannot be used answers no, because an unbounded hop is the failure this exists to stop.
  function claimRedirect(window, src) {
    try {
      const key = REDIRECT_MARKER + src;
      if (window.sessionStorage.getItem(key) !== null) {
        window.sessionStorage.removeItem(key);
        return false;
      }
      window.sessionStorage.setItem(key, "1");
      return true;
    } catch {
      return false;
    }
  }

  function settleRedirect(window, src) {
    try {
      window.sessionStorage.removeItem(REDIRECT_MARKER + src);
    } catch {
      // Nothing was claimed in a storage that cannot be used.
    }
  }

  globalThis.MDViewerSession = Object.freeze({
    viewerQuery,
    readViewerQuery,
    staleIds,
    storeDocument,
    readDocument,
    claimRedirect,
    settleRedirect,
  });
})();
