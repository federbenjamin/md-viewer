import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { VENDOR_FILES } from "../scripts/vendor.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const nodeModules = join(root, "node_modules");
const vendorDir = join(root, "web", "vendor");

// Source: brief deliverable 9, the non-font mappings. A `to` never changes.
const FIXED = {
  "marked/lib/marked.esm.js": "marked.esm.js",
  "dompurify/dist/purify.es.mjs": "purify.es.mjs",
  "github-markdown-css/github-markdown.css": "github-markdown.css",
  "@highlightjs/cdn-assets/highlight.min.js": "highlight.min.js",
  "@highlightjs/cdn-assets/styles/github.min.css": "hljs-github.min.css",
  "@highlightjs/cdn-assets/styles/github-dark.min.css": "hljs-github-dark.min.css",
  "katex/dist/katex.min.js": "katex.min.js",
  "katex/dist/katex.min.css": "katex.min.css",
  "mermaid/dist/mermaid.min.js": "mermaid.min.js",
};

test("VENDOR_FILES maps each pinned library file to its fixed vendor name", () => {
  const byTo = new Map(VENDOR_FILES.map((f) => [f.to, f.from]));
  for (const [, to] of Object.entries(FIXED)) {
    assert.ok(byTo.has(to), `missing vendor target ${to}`);
  }
  // The `from` side is allowed to be corrected when a package moves a file; compare the package prefix instead.
  for (const [from, to] of Object.entries(FIXED)) {
    const pkg = from.startsWith("@") ? from.split("/").slice(0, 2).join("/") : from.split("/")[0];
    assert.ok(byTo.get(to).startsWith(pkg + "/"), `${to} should come from ${pkg}, got ${byTo.get(to)}`);
  }
});

test("VENDOR_FILES has no duplicate destination, which would let one library overwrite another", () => {
  const tos = VENDOR_FILES.map((f) => f.to);
  assert.equal(new Set(tos).size, tos.length);
});

test("VENDOR_FILES entries are relative, never escaping node_modules or web/vendor", () => {
  for (const { from, to } of VENDOR_FILES) {
    for (const p of [from, to]) {
      assert.ok(!p.startsWith("/") && !p.split("/").includes(".."), p);
    }
  }
});

test("every katex woff2 font in node_modules is vendored under fonts/ with the same name", async () => {
  const fonts = (await readdir(join(nodeModules, "katex", "dist", "fonts"))).filter((n) => n.endsWith(".woff2"));
  assert.ok(fonts.length > 0, "katex ships woff2 fonts");
  const tos = new Set(VENDOR_FILES.map((f) => f.to));
  for (const name of fonts) assert.ok(tos.has(`fonts/${name}`), `fonts/${name} not vendored`);
});

test("only woff2 fonts are vendored, so the scheme handler's MIME table covers them", () => {
  for (const { to } of VENDOR_FILES.filter((f) => f.to.startsWith("fonts/"))) {
    assert.ok(to.endsWith(".woff2"), to);
  }
});

test("each web/vendor file byte-equals its pinned source in node_modules", async () => {
  for (const { from, to } of VENDOR_FILES) {
    const [source, copy] = await Promise.all([readFile(join(nodeModules, from)), readFile(join(vendorDir, to))]);
    assert.ok(source.equals(copy), `${to} differs from node_modules/${from}; run pnpm vendor`);
  }
});

async function filesUnder(dir, prefix = "") {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) out.push(...(await filesUnder(join(dir, entry.name), `${prefix}${entry.name}/`)));
    else out.push(`${prefix}${entry.name}`);
  }
  return out;
}

test("web/vendor holds no file outside VENDOR_FILES, so a dropped library cannot linger", async () => {
  const listed = new Set(VENDOR_FILES.map((f) => f.to));
  for (const file of await filesUnder(vendorDir)) {
    assert.ok(listed.has(file), `unlisted vendored file ${file}`);
  }
});
