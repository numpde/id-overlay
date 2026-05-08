import fs from "node:fs/promises";
import path from "node:path";

export const WEB_ACCESSIBLE_CONTENT_ENTRYPOINT = "src/content/content.js";
export const WEB_ACCESSIBLE_STATIC_RESOURCES = Object.freeze([
  "src/content/content.css",
]);

const RELATIVE_MODULE_SPECIFIER_PATTERN = /(?:import\s+(?:[^"'()]+?\s+from\s+)?|import\s*\(|export\s+[^"']+?\s+from\s*)["'](\.[^"']+)["']/g;

export async function createChromeManifest({ root, sourceManifest }) {
  return {
    ...sourceManifest,
    web_accessible_resources: [
      {
        resources: await collectWebAccessibleResources({ root }),
        matches: sourceManifest.host_permissions,
      },
    ],
  };
}

export async function collectWebAccessibleResources({ root }) {
  const resources = [
    ...WEB_ACCESSIBLE_STATIC_RESOURCES,
    ...await collectModuleGraph({
      root,
      entryPath: WEB_ACCESSIBLE_CONTENT_ENTRYPOINT,
    }),
  ];
  return [...new Set(resources)];
}

export async function collectModuleGraph({ root, entryPath, seen = new Set() }) {
  if (seen.has(entryPath)) {
    return seen;
  }
  seen.add(entryPath);

  const source = await fs.readFile(path.join(root, entryPath), "utf8");
  for (const match of source.matchAll(RELATIVE_MODULE_SPECIFIER_PATTERN)) {
    const resolved = normalizeSourcePath(path.join(path.dirname(entryPath), match[1]));
    if (!resolved.startsWith("src/")) {
      continue;
    }
    await collectModuleGraph({ root, entryPath: resolved, seen });
  }

  return seen;
}

function normalizeSourcePath(filePath) {
  return path
    .normalize(filePath)
    .replace(/\\/g, "/");
}
