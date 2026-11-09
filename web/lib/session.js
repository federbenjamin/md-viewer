// Classic script: the background page lists it before background.js, so this publishes one frozen global.
(function () {
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

  globalThis.MDViewerSession = Object.freeze({ viewerQuery, readViewerQuery, staleIds });
})();
