import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

import { DIST_DIR, repoPath } from "../helpers/paths.js";
import { createChromeManifest } from "../../scripts/chrome-manifest.mjs";

test("chrome build output includes the manifest and source tree", async () => {
  const distManifest = JSON.parse(await fs.readFile(repoPath("dist", "manifest.json"), "utf8"));
  const sourceManifest = JSON.parse(await fs.readFile(repoPath("manifest.chrome.json"), "utf8"));

  assert.deepEqual(distManifest, await createChromeManifest({
    root: repoPath(),
    sourceManifest,
  }));
  assert.deepEqual(distManifest.content_scripts[0].js, ["src/content/content-loader.js"]);
  assert.ok(distManifest.web_accessible_resources[0].resources.includes("src/content/content.js"));
  assert.ok(distManifest.web_accessible_resources[0].resources.includes("src/content/main.js"));

  for (const requiredPath of [
    "src/content/content-loader.js",
    "src/content/content.js",
    "src/content/main.js",
    "src/content/content.css",
    "src/core/build-info.js",
    "src/core/logger.js",
    "src/core/session.js",
  ]) {
    const stat = await fs.stat(repoPath("dist", requiredPath));
    assert.ok(stat.isFile(), `${requiredPath} should exist in dist`);
  }
});

test("chrome build stamps build metadata into dist", async () => {
  const buildInfoSource = await fs.readFile(repoPath("dist", "src/core/build-info.js"), "utf8");

  assert.match(buildInfoSource, /version:\s*"0\.0\.1"/);
  assert.doesNotMatch(buildInfoSource, /source-tree/);
  assert.match(buildInfoSource, /builtAt:\s*".+T.+Z"/);
});
