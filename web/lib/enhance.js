import { reportFailure } from "./report.js";

export const KATEX_PURIFY_CONFIG = Object.freeze({
  USE_PROFILES: { html: true, svg: true, mathMl: true },
});

const HIGHLIGHT_TARGETS = 'pre > code[class*="language-"]:not(.language-mermaid)';
const MATH_TARGETS = ".math";
const MERMAID_TARGETS = "pre > code.language-mermaid";

export function enhancementsFor(root) {
  return {
    highlight: root.querySelector(HIGHLIGHT_TARGETS) !== null,
    math: root.querySelector(MATH_TARGETS) !== null,
    mermaid: root.querySelector(MERMAID_TARGETS) !== null,
  };
}

function tryEach(targets, library, action) {
  for (const target of targets) {
    try {
      action(target);
    } catch (error) {
      reportFailure(library, error);
    }
  }
}

async function renderDiagrams(root, mermaid, dark) {
  const doc = root.ownerDocument;
  try {
    // Mermaid's output skips our DOMPurify; `strict` is what makes it safe (plan rule: Mermaid).
    mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: dark ? "dark" : "default" });
  } catch (error) {
    reportFailure("mermaid", error);
    return;
  }

  let index = 0;
  for (const code of root.querySelectorAll(MERMAID_TARGETS)) {
    const id = `mdviewer-mermaid-${index++}`;
    let svg;
    try {
      ({ svg } = await mermaid.render(id, code.textContent));
    } catch (error) {
      // A diagram Mermaid rejects stays as its source. Mermaid throws with its error graphic left in `d<id>` on the body.
      doc.getElementById(`d${id}`)?.remove();
      reportFailure("mermaid", error);
      continue;
    }
    try {
      const diagram = doc.createElement("div");
      diagram.className = "mermaid";
      diagram.innerHTML = svg;
      code.parentElement.replaceWith(diagram);
    } catch (error) {
      reportFailure("mermaid output", error);
    }
  }
}

export async function applyEnhancements(root, libs, { dark } = {}) {
  const { hljs, katex, purify, mermaid } = libs;

  if (hljs) {
    tryEach(root.querySelectorAll(HIGHLIGHT_TARGETS), "highlight.js", (code) => hljs.highlightElement(code));
  }

  if (katex && purify) {
    tryEach(root.querySelectorAll(MATH_TARGETS), "katex", (el) => {
      const html = katex.renderToString(el.textContent, {
        displayMode: el.classList.contains("math-block"),
        throwOnError: false,
      });
      el.innerHTML = purify.sanitize(html, KATEX_PURIFY_CONFIG);
    });
  }

  if (mermaid) await renderDiagrams(root, mermaid, dark);
}
