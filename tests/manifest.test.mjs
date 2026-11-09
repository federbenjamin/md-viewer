import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("the extension manifest is Manifest V3", async () => {
  const manifest = JSON.parse(await readFile(new URL("../web/manifest.json", import.meta.url), "utf8"));
  assert.equal(manifest.manifest_version, 3);
});
