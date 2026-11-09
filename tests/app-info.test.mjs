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

test("only iOS opens documents in place, shows the document browser and declares a scene manifest", () => {
  assert.equal(ios.LSSupportsOpeningDocumentsInPlace, true);
  assert.equal(ios.UISupportsDocumentBrowser, true);
  assert.deepEqual(ios.UIApplicationSceneManifest, { UIApplicationSupportsMultipleScenes: true });
  assert.equal(macos.LSSupportsOpeningDocumentsInPlace, undefined);
  assert.equal(macos.UISupportsDocumentBrowser, undefined);
  assert.equal(macos.UIApplicationSceneManifest, undefined);
});
