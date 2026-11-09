import "../lib/session.js";

async function loadFromExtension() {
  const { id, src } = globalThis.MDViewerSession.readViewerQuery(location.search);
  if (id === null) return { missing: true, src };
  const stored = await browser.storage.session.get(id);
  const text = stored?.[id]?.text;
  return typeof text === "string" ? { text, src } : { missing: true, src };
}

async function loadFromApp() {
  const response = await fetch("/document");
  if (!response.ok) return { missing: true, src: null };
  return { text: await response.text(), src: null };
}

export function loadSource() {
  return typeof browser !== "undefined" && browser.runtime?.id ? loadFromExtension() : loadFromApp();
}
