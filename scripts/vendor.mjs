import { copyFileSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const nodeModules = join(root, "node_modules");
const vendorDir = join(root, "web", "vendor");

const katexFonts = readdirSync(join(nodeModules, "katex/dist/fonts"))
  .filter((name) => name.endsWith(".woff2"))
  .sort()
  .map((name) => ({ from: `katex/dist/fonts/${name}`, to: `fonts/${name}` }));

export const VENDOR_FILES = Object.freeze(
  [
    { from: "marked/lib/marked.esm.js", to: "marked.esm.js" },
    { from: "dompurify/dist/purify.es.mjs", to: "purify.es.mjs" },
    { from: "github-markdown-css/github-markdown.css", to: "github-markdown.css" },
    { from: "@highlightjs/cdn-assets/highlight.min.js", to: "highlight.min.js" },
    { from: "@highlightjs/cdn-assets/styles/github.min.css", to: "hljs-github.min.css" },
    { from: "@highlightjs/cdn-assets/styles/github-dark.min.css", to: "hljs-github-dark.min.css" },
    { from: "katex/dist/katex.min.js", to: "katex.min.js" },
    { from: "katex/dist/katex.min.css", to: "katex.min.css" },
    ...katexFonts,
    { from: "mermaid/dist/mermaid.min.js", to: "mermaid.min.js" },
  ].map((entry) => Object.freeze(entry)),
);

function main() {
  rmSync(vendorDir, { recursive: true, force: true });
  for (const { from, to } of VENDOR_FILES) {
    const target = join(vendorDir, to);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(join(nodeModules, from), target);
  }
  console.log(`vendored ${VENDOR_FILES.length} files into web/vendor`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
