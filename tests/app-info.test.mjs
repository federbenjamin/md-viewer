import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { JSDOM } from "jsdom";

function plistValue(node) {
  const children = [...node.children];
  switch (node.tagName) {
    case "dict":
      return Object.fromEntries(
        children.flatMap((child, i) => (child.tagName === "key" ? [[child.textContent, plistValue(children[i + 1])]] : [])),
      );
    case "array":
      return children.map(plistValue);
    case "string":
      return node.textContent;
    case "true":
      return true;
    case "false":
      return false;
    default:
      throw new Error(`unexpected plist element <${node.tagName}>`);
  }
}

async function readPlist(folder) {
  const xml = await readFile(new URL(`../MDViewer/${folder}/Info.plist`, import.meta.url), "utf8");
  const { document } = new JSDOM(xml, { contentType: "text/xml" }).window;
  return plistValue(document.documentElement.firstElementChild);
}

const ios = await readPlist("iOS (App)");
const macos = await readPlist("macOS (App)");

// Source for every expected value: brief deliverable 13, and deliverable 12 for the scene manifest.
for (const [platform, plist] of [["iOS", ios], ["macOS", macos]]) {
  test(`${platform} registers Markdown as a read-only document type and allows http images`, () => {
    assert.deepEqual(plist.CFBundleDocumentTypes, [
      {
        CFBundleTypeName: "Markdown",
        CFBundleTypeRole: "Viewer",
        LSHandlerRank: "Alternate",
        LSItemContentTypes: ["net.daringfireball.markdown"],
      },
    ]);
    assert.deepEqual(plist.UTImportedTypeDeclarations, [
      {
        UTTypeIdentifier: "net.daringfireball.markdown",
        UTTypeConformsTo: ["public.plain-text"],
        UTTypeDescription: "Markdown",
        UTTypeTagSpecification: {
          "public.filename-extension": ["md", "markdown"],
          "public.mime-type": ["text/markdown"],
        },
      },
    ]);
    assert.deepEqual(plist.NSAppTransportSecurity, { NSAllowsArbitraryLoadsInWebContent: true });
  });
}

function firstCapture(pattern, text, label) {
  const match = pattern.exec(text);
  assert.ok(match, `${label} is written where the test expects it`);
  return match[1];
}

const repoFile = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("the Swift scheme handler and the viewer agree on the document path", async () => {
  const handler = await repoFile("MDViewer/App/ViewerSchemeHandler.swift");
  const source = await repoFile("web/viewer/source.js");
  assert.equal(
    firstCapture(/path == "([^"]+)"/, handler, "the handler's document path"),
    firstCapture(/fetch\("([^"]+)"\)/, source, "the viewer's document fetch"),
  );
});

test("the Swift document type is the type both plists import", async () => {
  const document = await repoFile("MDViewer/App/MarkdownDocument.swift");
  const swiftType = firstCapture(/UTType\(importedAs: "([^"]+)"/, document, "the imported type");
  for (const plist of [ios, macos]) {
    assert.equal(plist.UTImportedTypeDeclarations[0].UTTypeIdentifier, swiftType);
  }
});

test("the settings button's extension suffix matches the extension targets' bundle id", async () => {
  const setup = await repoFile("MDViewer/App/SetupView.swift");
  const project = await repoFile("MDViewer/MDViewer.xcodeproj/project.xcproj");
  const suffix = firstCapture(/bundleIdentifier! \+ "([^"]+)"/, setup, "the extension suffix");
  const ids = [...new Set([...project.matchAll(/"PRODUCT_BUNDLE_IDENTIFIER": "([^"]+)"/g)].map((match) => match[1]))];
  const appId = ids.reduce((shortest, id) => (id.length < shortest.length ? id : shortest));
  assert.deepEqual(ids.toSorted(), [appId, appId + suffix].toSorted());
});

test("only iOS opens documents in place, shows the document browser and declares a scene manifest", () => {
  assert.equal(ios.LSSupportsOpeningDocumentsInPlace, true);
  assert.equal(ios.UISupportsDocumentBrowser, true);
  assert.deepEqual(ios.UIApplicationSceneManifest, { UIApplicationSupportsMultipleScenes: true });
  assert.equal(macos.LSSupportsOpeningDocumentsInPlace, undefined);
  assert.equal(macos.UISupportsDocumentBrowser, undefined);
  assert.equal(macos.UIApplicationSceneManifest, undefined);
});
