import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  createChromeManifest,
} from "../../../../scripts/chrome-manifest.mjs";
import {
  collectBrowserResources,
} from "../../../../scripts/build-chrome.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const EXTENSION_CONTENT_MODULE = "hex/bootstrap/extension-content.js";

// Class-b, deliberately not class-a: browser packaging mechanics may still
// change. The stable build boundary is that generated manifests derive loadable
// resources from the hex extension content graph and never expose tests or
// legacy code to the browser.
test("chrome manifest is generated from the hex extension content graph", async () => {
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

// Class-b, not class-a: exact copied resource categories may grow with browser
// features, but build input must stay manifest-derived. The build script should
// not maintain a second source/assets directory list that can drift from the
// generated manifest.
test("chrome build resources are derived from the generated manifest", () => {
  assert.deepEqual(collectBrowserResources({
    content_scripts: [{
      js: ["src/content/content-loader.js"],
      css: ["src/content/content.css"],
    }],
    web_accessible_resources: [{
      resources: [
        "hex/bootstrap/extension-content.js",
        "hex/bootstrap/runtime.js",
        "src/content/content-loader.js",
      ],
    }],
  }), [
    "hex/bootstrap/extension-content.js",
    "hex/bootstrap/runtime.js",
    "src/content/content-loader.js",
    "src/content/content.css",
  ].sort());
});

function readSource(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function repoPath(...segments) {
  return path.join(REPO_ROOT, ...segments);
}
