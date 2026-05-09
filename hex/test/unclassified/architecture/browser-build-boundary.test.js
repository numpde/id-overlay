import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  WEB_ACCESSIBLE_CONTENT_ENTRYPOINT,
  collectModuleGraph,
  createChromeManifest,
} from "../../../../scripts/chrome-manifest.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

// Unclassified: this names the proposed module entrypoint for the clean shell.
// It should be promoted only if we still want a loader+module split after the
// next implementation pass.
test("web-accessible graph starts from the module content entrypoint", () => {
  assert.equal(
    WEB_ACCESSIBLE_CONTENT_ENTRYPOINT,
    "src/content/main.js",
    "the web-accessible graph should start at the module entrypoint, not the loader",
  );
});

// Unclassified: the manifest must be derived from the real source graph, not a
// toy fixture. This protects against the earlier failure mode where Chrome
// denied a dynamic import because a dependency was missing from resources.
test("chrome manifest can be generated from the real content graph", async () => {
  assert.equal(
    fs.existsSync(repoPath(WEB_ACCESSIBLE_CONTENT_ENTRYPOINT)),
    true,
    `missing ${WEB_ACCESSIBLE_CONTENT_ENTRYPOINT}`,
  );

  const sourceManifest = JSON.parse(readSource(repoPath("manifest.chrome.json")));

  const manifest = await createChromeManifest({
    root: REPO_ROOT,
    sourceManifest,
  });

  assert.deepEqual(manifest.content_scripts[0].js, ["src/content/content-loader.js"]);
  assert.equal(
    manifest.web_accessible_resources[0].resources.includes("src/content/main.js"),
    true,
  );
});

// Unclassified: copying whole source directories makes the bundle lie about
// what the manifest needs. The build should copy content scripts plus generated
// web-accessible resources only, so stale legacy/test files cannot hitchhike.
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

// Unclassified: the quarantine rule should apply to the future shell and build
// scripts too, not just to hex modules. Legacy may be reference material; it
// must not be imported or packed into the new browser path.
test("browser shell and build path do not reference legacy", () => {
  const violations = [];
  for (const filePath of [
    ...listJavaScriptFiles(repoPath("src")),
    ...listJavaScriptFiles(repoPath("scripts")),
    repoPath("manifest.chrome.json"),
  ]) {
    if (!fs.existsSync(filePath)) {
      continue;
    }
    if (/\blegacy\b|legacy\//.test(readSource(filePath))) {
      violations.push(relativeToRepo(filePath));
    }
  }

  assert.deepEqual(violations, []);
});

function listJavaScriptFiles(rootDir) {
  if (!fs.existsSync(rootDir)) {
    return [];
  }
  const files = [];
  for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
    const filePath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listJavaScriptFiles(filePath));
      continue;
    }
    if (entry.isFile() && filePath.endsWith(".js")) {
      files.push(filePath);
    }
  }
  return files.sort();
}

function readSource(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function repoPath(...segments) {
  return path.join(REPO_ROOT, ...segments);
}

function relativeToRepo(filePath) {
  return path.relative(REPO_ROOT, filePath);
}
