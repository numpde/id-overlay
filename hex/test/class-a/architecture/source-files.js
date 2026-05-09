// Shared source scanning helpers for architecture tests. These helpers are
// intentionally test-local so production hex code does not grow reflection
// utilities just to police its own structure.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CURRENT_DIR = path.dirname(fileURLToPath(import.meta.url));

export const REPO_ROOT = path.resolve(CURRENT_DIR, "../../../..");
export const HEX_ROOT = path.join(REPO_ROOT, "hex");

export function repoPath(...segments) {
  return path.join(REPO_ROOT, ...segments);
}

export function hexPath(...segments) {
  return path.join(HEX_ROOT, ...segments);
}

export function listJavaScriptFiles(rootDir, { includeTests = false } = {}) {
  return listFiles(rootDir, {
    include(filePath) {
      return filePath.endsWith(".js")
        && (includeTests || !isInsidePath(filePath, hexPath("test")));
    },
  });
}

export function readSource(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

export function relativeToRepo(filePath) {
  return path.relative(REPO_ROOT, filePath);
}

export function resolveRelativeImport(importerPath, specifier) {
  if (!specifier.startsWith(".")) {
    return null;
  }
  return path.resolve(path.dirname(importerPath), specifier);
}

export function extractImportSpecifiers(source) {
  const imports = [];
  const importPattern = /(?:import|export)\s+(?:[^'"]*?\sfrom\s*)?["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)/g;
  for (const match of source.matchAll(importPattern)) {
    imports.push(match[1] ?? match[2]);
  }
  return imports;
}

export function isInsidePath(filePath, directoryPath) {
  const relativePath = path.relative(directoryPath, filePath);
  return relativePath === "" || (
    !relativePath.startsWith("..") && !path.isAbsolute(relativePath)
  );
}

function listFiles(rootDir, { include }) {
  if (!fs.existsSync(rootDir)) {
    return [];
  }
  const files = [];
  for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
    const filePath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFiles(filePath, { include }));
      continue;
    }
    if (entry.isFile() && include(filePath)) {
      files.push(filePath);
    }
  }
  return files.sort();
}
