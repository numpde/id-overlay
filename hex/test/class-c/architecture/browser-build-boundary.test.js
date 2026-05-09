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

// Class-c: packaging should copy only files reachable from the generated
// manifest, but this test still talks in terms of one script implementation
// hook. Keep the pressure visible while the browser build pipeline is rebuilt.
test("chrome build copies only manifest-reachable browser resources", () => {
  const source = readSource(repoPath("scripts/build-chrome.mjs"));

  assert.equal(
    /\bcollectBrowserResources\b/.test(source),
    true,
    "build should derive copied files from manifest content scripts and web-accessible resources",
  );
  assert.equal(
    /\bcp\s*\(/.test(source),
    false,
    "build should not recursively copy whole source directories",
  );
  assert.equal(
    /\[\s*["']src["']\s*,\s*["']assets["']\s*\]/.test(source),
    false,
    "build should not maintain a parallel directory-copy list",
  );
});

function readSource(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function repoPath(...segments) {
  return path.join(REPO_ROOT, ...segments);
}
