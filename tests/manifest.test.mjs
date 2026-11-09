import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const webDir = fileURLToPath(new URL("../web/", import.meta.url));
const manifest = JSON.parse(await readFile(join(webDir, "manifest.json"), "utf8"));

// Source: brief deliverable 7, which spells the policy out string for string.
const EXPECTED_CSP =
  "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' http: https:; " +
  "font-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-src 'none'; object-src 'none'";

test("the extension manifest is Manifest V3", () => {
  assert.equal(manifest.manifest_version, 3);
});

test("the only permission is storage, so no host or tabs access is requested", () => {
  assert.deepEqual(manifest.permissions, ["storage"]);
  assert.equal(manifest.host_permissions, undefined);
});

test("one content script fires on .md and .markdown URLs at document_end with detect.js loaded first", () => {
  assert.equal(manifest.content_scripts.length, 1);
  const [script] = manifest.content_scripts;
  assert.deepEqual(script.matches, ["*://*/*.md", "*://*/*.markdown"]);
  // detect.js is a classic global that content.js reads, so order matters.
  assert.deepEqual(script.js, ["lib/detect.js", "content.js"]);
  assert.equal(script.run_at, "document_end");
});

test("the non-persistent background loads session.js before background.js", () => {
  assert.deepEqual(manifest.background, { scripts: ["lib/session.js", "background.js"], persistent: false });
});

test("web_accessible_resources exposes viewer/viewer.html and nothing else", () => {
  assert.deepEqual(manifest.web_accessible_resources, [
    { resources: ["viewer/viewer.html"], matches: ["*://*/*"] },
  ]);
});

test("the extension-pages CSP is exactly the contained policy", () => {
  assert.deepEqual(Object.keys(manifest.content_security_policy), ["extension_pages"]);
  assert.equal(manifest.content_security_policy.extension_pages, EXPECTED_CSP);
});

test("the CSP never allows unsafe-eval, inline script, or wildcard sources", () => {
  const directives = new Map(
    manifest.content_security_policy.extension_pages
      .split(";")
      .map((d) => d.trim().split(/\s+/))
      .map(([name, ...values]) => [name, values]),
  );
  assert.deepEqual(directives.get("script-src"), ["'self'"]);
  assert.deepEqual(directives.get("default-src"), ["'none'"]);
  assert.ok(!manifest.content_security_policy.extension_pages.includes("unsafe-eval"));
});

async function htmlFilesUnder(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await htmlFilesUnder(path)));
    else if (entry.name.endsWith(".html")) out.push(path);
  }
  return out;
}

test("no page under web/ carries a CSP meta tag, because the header is the single source", async () => {
  for (const file of await htmlFilesUnder(webDir)) {
    const html = await readFile(file, "utf8");
    assert.doesNotMatch(html, /http-equiv\s*=\s*["']?content-security-policy/i, file);
  }
});
