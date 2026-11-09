// The body ends at the first unescaped `$$`, so a line such as `$$x$$ and more` cannot reach a later paragraph's `$$`.
const BLOCK_MATH = /^ {0,3}\$\$((?:\\[\s\S]|(?!\$\$)[^\\])+)\$\$[ \t]*(?:\n+|$)/;
const BLOCK_MATH_START = /^ {0,3}\$\$/m;
// `$$…$$` in running text: the body may hold spaces at its edges and a lone `$`, but must hold more than space.
const DOUBLE_DOLLAR_SPAN = String.raw`\$\$(?!\s*\$\$)((?:\\[^\n]|(?!\$\$)[^\\\x60])+)\$\$(?!\d)`;
// Opening `$` before a non-space; closing `$` after a non-space and not before a digit, so `$5 and $10` stays prose.
const SINGLE_DOLLAR_SPAN = String.raw`\$(?!\s)((?:\\[^\n]|[^\\$\x60])+?)(?<!\s)\$(?!\d)`;
// No backtick inside either form: a span never reaches into a code span.
const INLINE_MATH_SOURCE = `${DOUBLE_DOLLAR_SPAN}|${SINGLE_DOLLAR_SPAN}`;
const INLINE_MATH = new RegExp(`^(?:${INLINE_MATH_SOURCE})`);
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
    return { type: "inlineMath", raw: match[0], text: (match[1] ?? match[2]).trim() };
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
