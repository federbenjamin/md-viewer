import DOMPurify from "../vendor/purify.es.mjs";
import "../lib/session.js";
import { applyEnhancements, enhancementsFor } from "../lib/enhance.js";
import { errorClass } from "../lib/report.js";
import { createRenderer } from "../lib/render.js";
import { documentTitle } from "../lib/title.js";
import { rewriteUrls } from "../lib/urls.js";
import { loadLibraries } from "./assets.js";
import { loadSource } from "./source.js";

const UNAVAILABLE = "This document is no longer available.";
const RENDER_FAILED = "This document could not be displayed. The Raw button shows its source.";

const content = document.getElementById("content");
const rawButton = document.getElementById("raw");
rawButton.disabled = true;

function showMessage(text) {
  const message = document.createElement("p");
  message.textContent = text;
  content.replaceChildren(message);
}

function enableRawToggle(text) {
  let rendered = null;
  rawButton.addEventListener("click", () => {
    if (rendered === null) {
      rendered = [...content.childNodes];
      const source = document.createElement("pre");
      source.id = "source";
      source.textContent = text;
      content.replaceChildren(source);
      rawButton.setAttribute("aria-pressed", "true");
    } else {
      content.replaceChildren(...rendered);
      rendered = null;
      rawButton.setAttribute("aria-pressed", "false");
    }
  });
  rawButton.disabled = false;
}

async function handleMissing(src) {
  // Back on the page itself, the content script stores the text afresh; the viewer never fetches src.
  if (src !== null && globalThis.MDViewerSession.claimRedirect(window, src)) {
    // The tab's mark would keep the raw page raw, as on Back; this hop must render.
    await browser.runtime.sendMessage({ type: "clear-mark" });
    location.replace(src);
  } else showMessage(UNAVAILABLE);
}

async function renderDocument({ text, src }) {
  if (src !== null) globalThis.MDViewerSession.settleRedirect(window, src);
  content.innerHTML = createRenderer(window).render(text);
  rewriteUrls(content, { src });
  document.title = documentTitle(content, src);

  const wanted = enhancementsFor(content);
  if (wanted.highlight || wanted.math || wanted.mermaid) {
    await loadLibraries(wanted);
    await applyEnhancements(
      content,
      { hljs: window.hljs, katex: window.katex, mermaid: window.mermaid, purify: DOMPurify(window) },
      { dark: matchMedia("(prefers-color-scheme: dark)").matches },
    );
  }
  enableRawToggle(text);
}

// Back from a later page clears the tab's mark on the way; marking on every show, a back-forward cache restore
// included, lets the next Back leave this src's raw page raw. The first pageshow follows readyState "complete".
function markTabOnEveryShow(src) {
  const mark = () =>
    browser.runtime.sendMessage({ type: "mark", src }).catch((error) => {
      console.error("mdviewer: marking the tab failed:", errorClass(error));
    });
  window.addEventListener("pageshow", mark);
  if (document.readyState === "complete") mark();
}

async function main() {
  let source;
  try {
    source = await loadSource();
  } catch (error) {
    console.error("mdviewer: reading the document failed:", errorClass(error));
    showMessage(UNAVAILABLE);
    return;
  }

  try {
    if (source.missing) await handleMissing(source.src);
    else {
      await renderDocument(source);
      if (source.src !== null) markTabOnEveryShow(source.src);
    }
  } catch (error) {
    console.error("mdviewer: rendering failed:", errorClass(error));
    if (source.missing) {
      showMessage(UNAVAILABLE);
    } else {
      showMessage(RENDER_FAILED);
      enableRawToggle(source.text);
    }
  }
}

main();
