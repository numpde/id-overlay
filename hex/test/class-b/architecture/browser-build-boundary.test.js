import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  createChromeManifest,
} from "../../../../scripts/chrome-manifest.mjs";
import {
  buildChromeExtension,
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

// Class-b, deliberately not class-a: copied resource categories may grow with
// browser features. The build boundary is that copy input stays
// manifest-derived, avoiding a second source/assets list that can drift.
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

// Class-b, deliberately not class-a: copying files into a Chromium extension
// dist is packaging mechanics. The no-regret build boundary is operational:
// every module generated into web_accessible_resources must also physically
// exist in the build output, so runtime loading cannot depend on a stale manual
// copy list.
test("chrome build copies runtime modules reachable from content bootstrap", async () => {
  const outputDir = await fsp.mkdtemp(path.join(os.tmpdir(), "id-overlay-build-"));
  try {
    const manifest = await buildChromeExtension({
      rootDir: REPO_ROOT,
      outputDir,
    });
    const resources = new Set(manifest.web_accessible_resources[0].resources);

    for (const resource of [
      "hex/bootstrap/extension-content.js",
      "hex/bootstrap/index.js",
      "hex/adapters/ui/extension-ui-host.js",
      "hex/adapters/ui/panel-adapter.js",
      "hex/adapters/ui/overlay-adapter.js",
      "hex/adapters/extension/storage-port.js",
    ]) {
      assert.equal(resources.has(resource), true, `manifest missing ${resource}`);
      assert.equal(await fileExists(path.join(outputDir, resource)), true, `dist missing ${resource}`);
    }
  } finally {
    await fsp.rm(outputDir, {
      recursive: true,
      force: true,
    });
  }
});

function readSource(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function repoPath(...segments) {
  return path.join(REPO_ROOT, ...segments);
}

async function fileExists(filePath) {
  try {
    await fsp.access(filePath);
    return true;
  } catch {
    return false;
  }
}
