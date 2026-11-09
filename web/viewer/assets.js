import { reportFailure } from "../lib/report.js";

function appendAndAwait(element, path) {
  return new Promise((resolve, reject) => {
    element.addEventListener("load", () => resolve(), { once: true });
    element.addEventListener("error", () => reject(new Error(`failed to load ${path}`)), { once: true });
    document.head.append(element);
  });
}

function loadScript(path) {
  const script = document.createElement("script");
  script.src = path;
  return appendAndAwait(script, path);
}

function loadStyle(path, media) {
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = path;
  if (media) link.media = media;
  return appendAndAwait(link, path);
}

export async function loadLibraries({ highlight, math, mermaid }) {
  const loads = [];
  if (highlight) {
    loads.push(
      ["highlight.js", loadScript("../vendor/highlight.min.js")],
      ["highlight.js", loadStyle("../vendor/hljs-github.min.css")],
      ["highlight.js", loadStyle("../vendor/hljs-github-dark.min.css", "(prefers-color-scheme: dark)")],
    );
  }
  if (math) {
    loads.push(["katex", loadScript("../vendor/katex.min.js")], ["katex", loadStyle("../vendor/katex.min.css")]);
  }
  if (mermaid) loads.push(["mermaid", loadScript("../vendor/mermaid.min.js")]);

  const results = await Promise.allSettled(loads.map(([, load]) => load));
  results.forEach((result, index) => {
    if (result.status === "rejected") reportFailure(`loading ${loads[index][0]}`, result.reason);
  });
}
