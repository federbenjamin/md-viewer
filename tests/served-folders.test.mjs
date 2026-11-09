import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const web = join(root, "web");
const handler = readFileSync(join(root, "MDViewer/App/ViewerSchemeHandler.swift"), "utf8");

// project.xcproj is JSON with trailing commas, which Xcode accepts and JSON.parse does not.
const project = JSON.parse(
  readFileSync(join(root, "MDViewer/MDViewer.xcodeproj/project.xcproj"), "utf8").replace(/,(\s*[\]}])/g, "$1"),
);

function fileEntries(nodes) {
  return nodes.flatMap((node) => [node, ...fileEntries(node.children ?? [])]);
}

const entries = fileEntries(project.files);

function servedFolders() {
  const list = /servedFolders: Set<String> = \[([^\]]*)\]/.exec(handler);
  assert.ok(list, "ViewerSchemeHandler declares servedFolders");
  return [...list[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]);
}

const APP_RESOURCES = ["MDViewer (iOS)/resources", "MDViewer (macOS)/resources"];

function assertInBothApps(path) {
  const entry = entries.find((candidate) => candidate.path === path);
  assert.ok(entry, `${path} is in the project`);
  for (const phase of APP_RESOURCES) {
    assert.ok(entry["target-membership"]?.includes(phase), `${path} is a resource of ${phase}`);
  }
}

test("every folder the scheme handler serves is a resource of both apps and holds files", () => {
  const folders = servedFolders();
  assert.ok(folders.length > 0);
  for (const folder of folders) {
    assertInBothApps(`../../web/${folder}`);
    assert.ok(readdirSync(join(web, folder)).length > 0, `web/${folder} holds files`);
  }
});

test("the manifest the scheme handler reads its policy from is a resource of both apps", () => {
  assertInBothApps("../../web/manifest.json");
});

test("the viewer page the app loads is in a served folder", () => {
  const viewerURL = /viewerURL = URL\(string: "mdviewer:\/\/app\/([^"]+)"\)/.exec(handler);
  assert.ok(viewerURL, "ViewerSchemeHandler declares viewerURL");
  assert.ok(servedFolders().includes(viewerURL[1].split("/")[0]));
  assert.ok(existsSync(join(web, viewerURL[1])), `web/${viewerURL[1]} exists`);
});

test("every file the viewer and renderer reference exists in a served folder", () => {
  const referencing = ["viewer", "lib"].flatMap((folder) =>
    readdirSync(join(web, folder)).map((name) => join(web, folder, name)),
  );
  const references = /["'](\.{1,2}\/[^"'\s]+\.(?:js|mjs|css))["']/g;
  const served = servedFolders();
  let seen = 0;
  for (const file of referencing) {
    for (const [, reference] of readFileSync(file, "utf8").matchAll(references)) {
      const target = resolve(dirname(file), reference);
      seen += 1;
      assert.ok(existsSync(target), `${basename(file)} references ${reference}, which does not exist`);
      assert.ok(served.some((folder) => target.startsWith(join(web, folder) + "/")), `${reference} is outside the served folders`);
    }
  }
  assert.ok(seen > 0, "the reference scan found the viewer's imports");
});
