import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

import { repoPath } from "../helpers/paths.js";

test("manifest keeps permissions narrow and points at the content entrypoint", async () => {
  const manifest = JSON.parse(await fs.readFile(repoPath("manifest.chrome.json"), "utf8"));

  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.permissions, ["storage"]);
  assert.deepEqual(manifest.host_permissions, ["https://www.openstreetmap.org/*"]);
  assert.deepEqual(manifest.content_scripts[0].js, ["src/content/content.js"]);
  assert.equal(manifest.content_scripts[0].run_at, "document_start");
});

test("all manifest-declared resources exist", async () => {
  const manifest = JSON.parse(await fs.readFile(repoPath("manifest.chrome.json"), "utf8"));
  const resources = manifest.web_accessible_resources.flatMap((entry) => entry.resources);

  for (const relativePath of resources) {
    const absolutePath = repoPath(relativePath);
    const stat = await fs.stat(absolutePath);
    assert.ok(stat.isFile(), `${relativePath} should exist`);
  }
});

test("all recursively imported content modules are listed as web accessible", async () => {
  const manifest = JSON.parse(await fs.readFile(repoPath("manifest.chrome.json"), "utf8"));
  const exposed = new Set(manifest.web_accessible_resources.flatMap((entry) => entry.resources));
  const discovered = await collectModuleGraph("src/content/main.js");

  for (const modulePath of discovered) {
    assert.ok(exposed.has(modulePath), `${modulePath} should be exposed in web_accessible_resources`);
  }
});

test("content stylesheet clips the overlay to the resolved map viewport", async () => {
  const stylesheet = await fs.readFile(repoPath("src/content/content.css"), "utf8");

  assert.match(
    stylesheet,
    /\.id-overlay-map-layer\s*\{[^}]*overflow:\s*hidden;/s,
    "the overlay map layer should clip image rendering to the map viewport"
  );
});

async function collectModuleGraph(entryPath, seen = new Set()) {
  if (seen.has(entryPath)) {
    return seen;
  }
  seen.add(entryPath);

  const source = await fs.readFile(repoPath(entryPath), "utf8");
  const importMatches = source.matchAll(/from\s+["'](\.[^"']+)["']/g);

  for (const match of importMatches) {
    const target = match[1];
    const resolved = path
      .normalize(path.join(path.dirname(entryPath), target))
      .replace(/\\/g, "/");
    if (!resolved.startsWith("src/")) {
      continue;
    }
    await collectModuleGraph(resolved, seen);
  }

  return seen;
}
