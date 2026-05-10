import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  collectModuleGraph,
} from "../../../../scripts/chrome-manifest.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const EXTENSION_CONTENT_MODULE = "hex/bootstrap/extension-content.js";

// Class-c: the build graph should be allowed to cross into hex production code
// because the extension adapter is part of hex. This is quarantined until the
// real extension content module exists and the graph collector supports that
// production entrypoint directly.
test("extension content module graph may include hex production but not tests or legacy", async () => {
  if (!fs.existsSync(repoPath(EXTENSION_CONTENT_MODULE))) {
    assert.fail(`missing ${EXTENSION_CONTENT_MODULE}`);
  }

  const resources = [...await collectModuleGraph({
    root: REPO_ROOT,
    entryPath: EXTENSION_CONTENT_MODULE,
  })].sort();

  assert.equal(resources.includes(EXTENSION_CONTENT_MODULE), true);
  assert.equal(resources.some((resource) => resource.startsWith("hex/")), true);
  assert.deepEqual(resources.filter((resource) => (
    resource.startsWith("hex/test/")
      || resource.startsWith("legacy/")
      || resource.includes("/legacy/")
  )), []);
});

function repoPath(...segments) {
  return path.join(REPO_ROOT, ...segments);
}
