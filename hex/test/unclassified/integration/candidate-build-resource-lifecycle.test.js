import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  buildChromeExtension,
} from "../../../../scripts/build-chrome.mjs";
import {
  repoPath,
} from "../../class-a/architecture/source-files.js";

// Unclassified: build packaging is browser-shell mechanics. The candidate
// behavior is operational: every production module reachable from the content
// entrypoint must be copied to dist and listed as loadable, so runtime behavior
// cannot depend on stale manually copied files.
test("candidate: chrome build copies runtime modules reachable from content bootstrap", async () => {
  const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "id-overlay-build-"));
  try {
    const manifest = await buildChromeExtension({
      rootDir: repoPath(),
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
    await fs.rm(outputDir, {
      recursive: true,
      force: true,
    });
  }
});

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
