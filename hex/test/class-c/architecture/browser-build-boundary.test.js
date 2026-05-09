import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  createChromeManifest,
} from "../../../../scripts/chrome-manifest.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const EXTENSION_CONTENT_MODULE = "hex/adapters/extension/content.js";

// Class-c: generated packaging from the real browser graph is the right
// pressure, but the extension content module does not exist yet. Keep this as
// a non-authoritative target until the browser-shell cut is implemented.
test("chrome manifest can be generated from the real extension adapter graph", async () => {
  assert.equal(
    fs.existsSync(repoPath(EXTENSION_CONTENT_MODULE)),
    true,
    `missing ${EXTENSION_CONTENT_MODULE}`,
  );

  const sourceManifest = JSON.parse(readSource(repoPath("manifest.chrome.json")));
  const manifest = await createChromeManifest({
    root: REPO_ROOT,
    sourceManifest,
  });

  assert.equal(
    manifest.web_accessible_resources[0].resources.includes(EXTENSION_CONTENT_MODULE),
    true,
  );
  assert.deepEqual(manifest.web_accessible_resources[0].resources.filter((resource) => (
    resource.startsWith("hex/test/")
      || resource.startsWith("legacy/")
      || resource.includes("/legacy/")
  )), []);
});

function readSource(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function repoPath(...segments) {
  return path.join(REPO_ROOT, ...segments);
}
