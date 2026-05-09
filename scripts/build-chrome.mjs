import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createChromeManifest } from "./chrome-manifest.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const distDir = path.join(root, "dist");

async function main() {
  await rm(distDir, { recursive: true, force: true });
  await mkdir(distDir, { recursive: true });

  const manifestSource = path.join(root, "manifest.chrome.json");
  const manifestTarget = path.join(distDir, "manifest.json");
  const manifestBuffer = await readFile(manifestSource);
  const manifest = JSON.parse(String(manifestBuffer));
  const chromeManifest = await createChromeManifest({
    root,
    sourceManifest: manifest,
  });
  await writeFile(manifestTarget, `${JSON.stringify(chromeManifest, null, 2)}\n`);

  for (const resource of collectBrowserResources(chromeManifest)) {
    await copyResource(resource);
  }

  process.stdout.write(`Built Chromium extension scaffold in ${distDir}\n`);
}

function collectBrowserResources(manifest) {
  return [...new Set([
    ...manifest.content_scripts.flatMap((contentScript) => contentScript.js ?? []),
    ...manifest.web_accessible_resources.flatMap((entry) => entry.resources ?? []),
  ])];
}

async function copyResource(resource) {
  const source = path.join(root, resource);
  const target = path.join(distDir, resource);
  await mkdir(path.dirname(target), { recursive: true });
  await copyFile(source, target);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
