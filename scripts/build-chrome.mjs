import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createChromeManifest } from "./chrome-manifest.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const distDir = path.join(root, "dist");

export async function buildChromeExtension({
  rootDir = root,
  outputDir = distDir,
} = {}) {
  await rm(outputDir, { recursive: true, force: true });
  await mkdir(outputDir, { recursive: true });

  const manifestSource = path.join(rootDir, "manifest.chrome.json");
  const manifestTarget = path.join(outputDir, "manifest.json");
  const manifestBuffer = await readFile(manifestSource);
  const manifest = JSON.parse(String(manifestBuffer));
  const chromeManifest = await createChromeManifest({
    root: rootDir,
    sourceManifest: manifest,
  });
  await writeFile(manifestTarget, `${JSON.stringify(chromeManifest, null, 2)}\n`);

  for (const resource of collectBrowserResources(chromeManifest)) {
    await copyBrowserResource({
      rootDir,
      outputDir,
      resource,
    });
  }

  return chromeManifest;
}

export function collectBrowserResources(manifest) {
  const resources = [];
  for (const contentScript of manifest.content_scripts ?? []) {
    resources.push(...contentScript.js ?? []);
    resources.push(...contentScript.css ?? []);
  }
  for (const webAccessibleResource of manifest.web_accessible_resources ?? []) {
    resources.push(...webAccessibleResource.resources ?? []);
  }
  return [...new Set(resources)].sort();
}

async function copyBrowserResource({ rootDir, outputDir, resource }) {
  const source = path.join(rootDir, resource);
  const target = path.join(outputDir, resource);
  await mkdir(path.dirname(target), { recursive: true });
  if (resource === "hex/bootstrap/build-info.js") {
    await writeFile(target, await stampedBuildInfoSource({ rootDir }));
    return;
  }
  await copyFile(source, target);
}

async function stampedBuildInfoSource({ rootDir }) {
  const sourceManifest = JSON.parse(String(
    await readFile(path.join(rootDir, "manifest.chrome.json")),
  ));
  return [
    "export const BUILD_INFO = Object.freeze({",
    `  version: ${JSON.stringify(sourceManifest.version)},`,
    `  builtAt: ${JSON.stringify(new Date().toISOString())},`,
    "});",
    "",
  ].join("\n");
}

async function main() {
  await buildChromeExtension();
  process.stdout.write(`Built Chromium extension scaffold in ${distDir}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
