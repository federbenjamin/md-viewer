const BLOCK_MATH = /^ {0,3}\$\$([\s\S]+?)\$\$[ \t]*(?:\n+|$)/;
const BLOCK_MATH_START = /^ {0,3}\$\$/m;
// Opening `$` before a non-space; closing `$` after a non-space and not before a digit, so `$5 and $10` stays prose.
// No backtick inside: a span never reaches into a code span.
const INLINE_MATH_SOURCE = String.raw`\$(?!\s)((?:\\[^\n]|[^\\$\x60])+?)(?<!\s)\$(?!\d)`;
const INLINE_MATH = new RegExp("^" + INLINE_MATH_SOURCE);
const INLINE_MATH_ALL = new RegExp(INLINE_MATH_SOURCE, "g");

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const blockMath = {
  name: "blockMath",
  level: "block",
  start(src) {
    return src.match(BLOCK_MATH_START)?.index;
  },
  tokenizer(src) {
    const match = BLOCK_MATH.exec(src);
    if (!match) return undefined;
    return { type: "blockMath", raw: match[0], text: match[1].trim() };
  },
  renderer(token) {
    return `<div class="math math-block">${escapeHtml(token.text)}</div>\n`;
  },
};

const inlineMath = {
  name: "inlineMath",
  level: "inline",
  start(src) {
    const index = src.indexOf("$");
    return index < 0 ? undefined : index;
  },
  tokenizer(src) {
    const match = INLINE_MATH.exec(src);
    if (!match) return undefined;
    return { type: "inlineMath", raw: match[0], text: match[1] };
  },
  renderer(token) {
    return `<span class="math math-inline">${escapeHtml(token.text)}</span>`;
  },
};

// Hides math from marked's emphasis scan so `_` and `*` inside `$…$` never pair with text outside it.
function emStrongMask(src) {
  return src.replace(INLINE_MATH_ALL, (span) => "$" + "a".repeat(span.length - 2) + "$");
}

export const mathExtension = Object.freeze({
  extensions: [blockMath, inlineMath],
  hooks: { emStrongMask },
});
