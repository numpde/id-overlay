import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildChromeExtension,
} from "../../../../scripts/build-chrome.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const BUILD_INFO_MODULE = "hex/bootstrap/build-info.js";

// Unclassified candidate: the legacy extension exposed stamped package metadata
// through runtime logging. This version keeps the proposed hex behavior at the
// build boundary without deciding whether build metadata belongs in logs, panel
// chrome, or a diagnostics surface.
test("chrome build stamps browser build metadata into packaged runtime", async () => {
  const outputDir = await fsp.mkdtemp(path.join(os.tmpdir(), "id-overlay-build-info-"));
  try {
    await buildChromeExtension({
      rootDir: REPO_ROOT,
      outputDir,
    });

    const buildInfoSource = await fsp.readFile(
      path.join(outputDir, BUILD_INFO_MODULE),
      "utf8",
    );
    const sourceManifest = JSON.parse(fs.readFileSync(repoPath("manifest.chrome.json"), "utf8"));

    assert.match(buildInfoSource, /\bexport\s+const\s+BUILD_INFO\b/);
    assert.match(
      buildInfoSource,
      new RegExp(`\\bversion:\\s*"${escapeRegExp(sourceManifest.version)}"`),
    );
    assert.doesNotMatch(buildInfoSource, /source-tree/);

    const builtAt = /\bbuiltAt:\s*"([^"]+)"/.exec(buildInfoSource)?.[1];
    assert.match(builtAt ?? "", /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    assert.equal(Number.isNaN(Date.parse(builtAt)), false);
  } finally {
    await fsp.rm(outputDir, {
      recursive: true,
      force: true,
    });
  }
});

// Unclassified candidate: stamping the module is insufficient if the extension
// cannot load it under Chromium's web-accessible resource rules.
test("chrome build metadata is loadable through the generated content graph", async () => {
  const outputDir = await fsp.mkdtemp(path.join(os.tmpdir(), "id-overlay-build-info-"));
  try {
    const manifest = await buildChromeExtension({
      rootDir: REPO_ROOT,
      outputDir,
    });
    const resources = new Set(manifest.web_accessible_resources[0].resources);

    assert.equal(resources.has(BUILD_INFO_MODULE), true);
    assert.equal(await fileExists(path.join(outputDir, BUILD_INFO_MODULE)), true);
  } finally {
    await fsp.rm(outputDir, {
      recursive: true,
      force: true,
    });
  }
});

function repoPath(...segments) {
  return path.join(REPO_ROOT, ...segments);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function fileExists(filePath) {
  try {
    await fsp.access(filePath);
    return true;
  } catch {
    return false;
  }
}
