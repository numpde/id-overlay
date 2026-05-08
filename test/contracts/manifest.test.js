import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

import { repoPath } from "../helpers/paths.js";
import {
  collectWebAccessibleResources,
  createChromeManifest,
} from "../../scripts/chrome-manifest.mjs";

test("manifest keeps permissions narrow and points at the content entrypoint", async () => {
  const manifest = JSON.parse(await fs.readFile(repoPath("manifest.chrome.json"), "utf8"));

  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.permissions, ["storage"]);
  assert.deepEqual(manifest.host_permissions, ["https://www.openstreetmap.org/*"]);
  assert.deepEqual(manifest.content_scripts[0].js, ["src/content/content-loader.js"]);
  assert.equal(manifest.content_scripts[0].run_at, "document_start");
  assert.equal(
    Object.hasOwn(manifest, "web_accessible_resources"),
    false,
    "web-accessible resources are generated from the module graph",
  );
});

test("content script manifest entry is a classic loader, not an ES module", async () => {
  const manifest = JSON.parse(await fs.readFile(repoPath("manifest.chrome.json"), "utf8"));
  const contentScriptPath = manifest.content_scripts[0].js[0];
  const loaderSource = await fs.readFile(repoPath(contentScriptPath), "utf8");
  const moduleSource = await fs.readFile(repoPath("src/content/content.js"), "utf8");

  assert.equal(contentScriptPath, "src/content/content-loader.js");
  assert.doesNotMatch(loaderSource, /^\s*import\s/m);
  assert.match(loaderSource, /import\s*\(\s*runtime\.getURL\("src\/content\/content\.js"\)\s*\)/);
  assert.match(moduleSource, /^\s*import\s/m);
});

test("generated web-accessible resources exist", async () => {
  const resources = await collectWebAccessibleResources({ root: repoPath() });

  for (const relativePath of resources) {
    const absolutePath = repoPath(relativePath);
    const stat = await fs.stat(absolutePath);
    assert.ok(stat.isFile(), `${relativePath} should exist`);
  }
});

test("generated chrome manifest exposes the content import graph exactly once", async () => {
  const sourceManifest = JSON.parse(await fs.readFile(repoPath("manifest.chrome.json"), "utf8"));
  const generatedManifest = await createChromeManifest({
    root: repoPath(),
    sourceManifest,
  });
  const resources = generatedManifest.web_accessible_resources.flatMap((entry) => entry.resources);

  assert.deepEqual(generatedManifest.web_accessible_resources, [{
    resources: await collectWebAccessibleResources({ root: repoPath() }),
    matches: sourceManifest.host_permissions,
  }]);
  assert.equal(new Set(resources).size, resources.length);
  assert.equal(resources[0], "src/content/content.css");
  assert.ok(resources.includes("src/content/content.js"));
  assert.ok(resources.includes("src/content/keyboard-gateway.js"));
  assert.ok(resources.includes("src/content/main.js"));
  assert.ok(resources.includes("src/content/page-adapter/map-view.js"));
  assert.ok(resources.includes("src/content/page-adapter/upstream-map-view.js"));
  assert.ok(resources.includes("src/content/page-adapter/map-hash-view.js"));
});

test("content stylesheet only styles the panel shell", async () => {
  const stylesheet = await fs.readFile(repoPath("src/content/content.css"), "utf8");

  assert.match(
    stylesheet,
    /\.id-overlay-panel\s*\{/s,
    "the panel stylesheet should style the extension panel"
  );
  assert.doesNotMatch(stylesheet, /\.id-overlay-map-layer\s*\{/s);
  assert.match(
    stylesheet,
    /\.id-overlay-panel\s*\{[^}]*overflow:\s*hidden;/s,
    "the panel should clip expanding children within its bounds",
  );
  assert.match(
    stylesheet,
    /\.id-overlay-panel\s*>\s*\*\s*\{[^}]*min-width:\s*0;/s,
    "panel grid children should be allowed to shrink inside the fixed panel width",
  );
  assert.match(
    stylesheet,
    /\.id-overlay-panel__status-detail-surface\s*\{[^}]*overflow-y:\s*auto;[^}]*scrollbar-gutter:\s*stable;/s,
    "expanded status should scroll internally instead of overflowing past the panel",
  );
  assert.match(
    stylesheet,
    /\.id-overlay-panel__status-wrap\s*\{[^}]*position:\s*relative;[^}]*min-height:\s*var\(--id-overlay-panel-status-line-height\);[^}]*isolation:\s*isolate;/s,
    "the collapsed status row should stay in normal panel flow",
  );
  assert.match(
    stylesheet,
    /\.id-overlay-panel__status-detail\s*\{[^}]*position:\s*absolute;[^}]*inset:\s*auto 0 0;/s,
    "the expanded status should overlay upward from the in-flow status row",
  );
});
