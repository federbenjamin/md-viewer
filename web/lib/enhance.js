export const KATEX_PURIFY_CONFIG = Object.freeze({
  USE_PROFILES: { html: true, svg: true, mathMl: true },
});

const HIGHLIGHT_TARGETS = 'pre > code[class*="language-"]:not(.language-mermaid)';
const MERMAID_TARGETS = "pre > code.language-mermaid";

export function enhancementsFor(root) {
  return {
    highlight: root.querySelector(HIGHLIGHT_TARGETS) !== null,
    math: root.querySelector(".math") !== null,
    mermaid: root.querySelector("code.language-mermaid") !== null,
  };
}

export async function applyEnhancements(root, libs, { dark } = {}) {
  const { hljs, katex, purify, mermaid } = libs;

  if (hljs) {
    for (const code of root.querySelectorAll(HIGHLIGHT_TARGETS)) hljs.highlightElement(code);
  }

  if (katex && purify) {
    for (const el of root.querySelectorAll(".math")) {
      const html = katex.renderToString(el.textContent, {
        displayMode: el.classList.contains("math-block"),
        throwOnError: false,
      });
      el.innerHTML = purify.sanitize(html, KATEX_PURIFY_CONFIG);
    }
  }

  if (mermaid) {
    // Mermaid's output skips our DOMPurify; `strict` is what makes it safe (plan rule: Mermaid).
    mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: dark ? "dark" : "default" });
    let index = 0;
    for (const code of root.querySelectorAll(MERMAID_TARGETS)) {
      const pre = code.parentElement;
      const id = `mdviewer-mermaid-${index++}`;
      try {
        const { svg } = await mermaid.render(id, code.textContent);
        const diagram = root.ownerDocument.createElement("div");
        diagram.className = "mermaid";
        diagram.innerHTML = svg;
        pre.replaceWith(diagram);
      } catch {
        // A diagram Mermaid rejects stays as its source. Mermaid throws with its error graphic left in `d<id>` on the body.
        root.ownerDocument.getElementById(`d${id}`)?.remove();
      }
    }
  }
}
