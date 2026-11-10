// Classic script: the background page lists it before background.js, so this publishes one frozen global.
(function () {
  // storage.session holds 10 MB in all; the newest documents stay.
  const KEEP_BEFORE_WRITE = 19;
  const REDIRECT_MARKER = "mdviewer-src-redirect:";
  // Back reloads the raw page with nothing in it to tell it from a fresh visit (iOS 27.2), so the background
  // remembers, per tab, the src it last sent to the viewer. Marks live beside documents under their own prefix.
  const TAB_MARK = "mdviewer-tab:";

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

  function tabMarkKey(tabId) {
    return Number.isInteger(tabId) ? TAB_MARK + tabId : null;
  }

  function isTabMark(key) {
    return key.startsWith(TAB_MARK);
  }

  function isReturn(entries, tabId, src) {
    const key = tabMarkKey(tabId);
    return key !== null && entries[key] === src;
  }

  function staleIds(entries, keep) {
    return Object.entries(entries)
      .filter(([id]) => !isTabMark(id))
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
      const others = Object.keys(await storage.get(null)).filter((key) => key !== id && !isTabMark(key));
      if (others.length > 0) await storage.remove(others);
      await storage.set(record);
    }
  }

  // Resolves to { id }, { returned: true } or { reason, errorName }; it never rejects.
  async function storeDocument(storage, text, src, tabId) {
    const id = crypto.randomUUID();
    try {
      const entries = await storage.get(null);
      const markKey = tabMarkKey(tabId);
      if (isReturn(entries, tabId, src)) {
        await storage.remove([markKey]);
        return { returned: true };
      }
      const stale = staleIds(entries, KEEP_BEFORE_WRITE);
      if (stale.length > 0) await storage.remove(stale);
      const record = { [id]: { text, at: Date.now() } };
      if (markKey !== null) record[markKey] = src;
      await writeOrMakeRoom(storage, id, record);
      return { id };
    } catch (error) {
      return { reason: isQuotaError(error) ? "quota" : "unavailable", errorName: error?.name ?? "unknown" };
    }
  }

  async function clearTabMark(storage, tabId) {
    const key = tabMarkKey(tabId);
    if (key === null) return;
    try {
      await storage.remove([key]);
    } catch {
      // A mark that stays only keeps the raw page on the next visit to that src; the hop still goes ahead.
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
    isReturn,
    storeDocument,
    clearTabMark,
    readDocument,
    claimRedirect,
    settleRedirect,
  });
})();
