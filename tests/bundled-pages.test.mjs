import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repoDir = fileURLToPath(new URL("../", import.meta.url));
const projectDir = join(repoDir, "MDViewer");
const appDir = join(projectDir, "App");
const APP_TARGETS = ["MDViewer (iOS)/resources", "MDViewer (macOS)/resources"];

function* projectFiles(entries, folder) {
  for (const entry of entries) {
    const path = resolve(folder, (entry.path ?? "").replace("<PROJECT>", projectDir));
    if (entry.kind === "group") yield* projectFiles(entry.children, path);
    else yield { path, targets: entry["target-membership"] ?? [] };
  }
}

async function readProjectFiles() {
  const source = await readFile(join(projectDir, "MDViewer.xcodeproj", "project.xcproj"), "utf8");
  const project = JSON.parse(source.replace(/,(\s*[\]}])/g, "$1"));
  return [...projectFiles(project.files, projectDir)];
}

async function readBundledPageNames() {
  const swiftFiles = (await readdir(appDir)).filter((name) => name.endsWith(".swift"));
  const sources = await Promise.all(swiftFiles.map((name) => readFile(join(appDir, name), "utf8")));
  const calls = sources.flatMap((source) => [...source.matchAll(/BundledMarkdownView\(resource:\s*"([^"]+)"\)/g)]);
  return [...new Set(calls.map(([, name]) => name))].sort();
}

const pageNames = await readBundledPageNames();
const projectEntries = await readProjectFiles();

test("the app's screens open exactly the two bundled pages", () => {
  assert.deepEqual(pageNames, ["PRIVACY", "THIRD_PARTY_NOTICES"]);
});

for (const name of pageNames) {
  test(`${name}.md is one non-empty resource of both app targets`, async () => {
    const entries = projectEntries.filter((entry) => basename(entry.path) === `${name}.md`);
    assert.equal(entries.length, 1, `${name}.md must be listed once in project.xcproj`);
    assert.deepEqual(entries[0].targets.filter((target) => APP_TARGETS.includes(target)).sort(), APP_TARGETS);
    assert.ok((await stat(entries[0].path)).size > 0, `${entries[0].path} is empty`);
  });
}

// The app has no Swift test target, so the source is the only place a Node test can see this.
test("BundledMarkdownView logs both failures with the resource name and discards no read error", async () => {
  const source = await readFile(join(appDir, "BundledMarkdownView.swift"), "utf8");
  assert.ok(!source.includes("try?"), "a try? discards the read error");
  const logged = source.match(/logger\.error\("[^\n]*\\\(resource, privacy: \.public\)/g) ?? [];
  assert.equal(logged.length, 2, "the missing-file and the read-error branch each log the resource name");
});
