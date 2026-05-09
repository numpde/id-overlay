import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  WEB_ACCESSIBLE_CONTENT_ENTRYPOINT,
  collectModuleGraph,
} from "../../../../scripts/chrome-manifest.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

// Unclassified: resource collection should cross from src into hex production
// modules, but never into tests or legacy. This is the build-time mirror of the
// runtime dependency boundary.
test("content module graph may include hex production but not tests or legacy", async () => {
  if (!fs.existsSync(repoPath(WEB_ACCESSIBLE_CONTENT_ENTRYPOINT))) {
    assert.fail(`missing ${WEB_ACCESSIBLE_CONTENT_ENTRYPOINT}`);
  }

  const resources = [...await collectModuleGraph({
    root: REPO_ROOT,
    entryPath: WEB_ACCESSIBLE_CONTENT_ENTRYPOINT,
  })].sort();

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
