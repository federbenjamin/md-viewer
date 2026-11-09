import DOMPurify from "../vendor/purify.es.mjs";
import { applyEnhancements, enhancementsFor } from "../lib/enhance.js";
import { createRenderer } from "../lib/render.js";
import { rewriteUrls } from "../lib/urls.js";
import { loadSource } from "./source.js";

const UNAVAILABLE = "This document is no longer available.";

const content = document.getElementById("content");
const rawButton = document.getElementById("raw");
rawButton.disabled = true;

function loadScript(path) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = path;
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener("error", () => reject(new Error(`failed to load ${path}`)), { once: true });
    document.head.append(script);
  });
}

function loadStyle(path, media) {
  return new Promise((resolve, reject) => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = path;
    if (media) link.media = media;
    link.addEventListener("load", () => resolve(), { once: true });
    link.addEventListener("error", () => reject(new Error(`failed to load ${path}`)), { once: true });
    document.head.append(link);
  });
}

function loadLibraries({ highlight, math, mermaid }) {
  const loads = [];
  if (highlight) {
    loads.push(
      loadScript("../vendor/highlight.min.js"),
      loadStyle("../vendor/hljs-github.min.css"),
      loadStyle("../vendor/hljs-github-dark.min.css", "(prefers-color-scheme: dark)"),
    );
  }
  if (math) loads.push(loadScript("../vendor/katex.min.js"), loadStyle("../vendor/katex.min.css"));
  if (mermaid) loads.push(loadScript("../vendor/mermaid.min.js"));
  return Promise.allSettled(loads);
}

function lastPathSegment(src) {
  if (src === null) return null;
  const segment = new URL(src).pathname.split("/").filter(Boolean).pop();
  if (!segment) return null;
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function setTitle(src) {
  const heading = content.querySelector("h1")?.textContent.trim();
  document.title = heading || lastPathSegment(src) || "Markdown";
}

function showUnavailable() {
  const message = document.createElement("p");
  message.textContent = UNAVAILABLE;
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

async function main() {
  let source;
  try {
    source = await loadSource();
  } catch {
    showUnavailable();
    return;
  }

  if (source.missing) {
    // Back on the page itself, the content script stores the text afresh; the viewer never fetches src.
    if (source.src !== null) location.replace(source.src);
    else showUnavailable();
    return;
  }

  const { text, src } = source;
  content.innerHTML = createRenderer(window).render(text);
  rewriteUrls(content, { src });
  setTitle(src);

  const wanted = enhancementsFor(content);
  if (wanted.highlight || wanted.math || wanted.mermaid) {
    await loadLibraries(wanted);
    try {
      await applyEnhancements(
        content,
        { hljs: window.hljs, katex: window.katex, mermaid: window.mermaid, purify: DOMPurify(window) },
        { dark: matchMedia("(prefers-color-scheme: dark)").matches },
      );
    } catch {
      // The sanitised rendering stays as it is.
    }
  }
  enableRawToggle(text);
}

main();
