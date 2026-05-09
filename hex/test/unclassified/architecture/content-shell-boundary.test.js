import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const CONTENT_LOADER = repoPath("src/content/content-loader.js");
const CONTENT_MAIN = repoPath("src/content/main.js");

// Unclassified: this is the proposed cut line for the next browser shell. It
// should become class-b once the real shell exists and we know the names are
// not accidental scaffolding.
test("browser content shell has one loader and one module entrypoint", () => {
  const missing = [
    CONTENT_LOADER,
    CONTENT_MAIN,
  ]
    .filter((filePath) => !fs.existsSync(filePath))
    .map(relativeToRepo);

  assert.deepEqual(missing, []);
});

// Unclassified: the content module should be a composition edge, not a second
// application. Importing application/domain/adapters here recreates the rushed
// shell where product stepping and platform translation lived in one file.
test("content module imports only the bootstrap ring from hex", () => {
  if (!fs.existsSync(CONTENT_MAIN)) {
    return;
  }

  const violations = [];
  for (const specifier of extractImportSpecifiers(readSource(CONTENT_MAIN))) {
    const targetPath = resolveRelativeImport(CONTENT_MAIN, specifier);
    if (!targetPath || !isInsidePath(targetPath, repoPath("hex"))) {
      continue;
    }
    if (!isInsidePath(targetPath, repoPath("hex/bootstrap"))) {
      violations.push(`src/content/main.js imports non-bootstrap hex module: ${specifier}`);
    }
  }

  assert.deepEqual(violations, []);
});

function extractImportSpecifiers(source) {
  const imports = [];
  const importPattern = /(?:import|export)\s+(?:[^'"]*?\sfrom\s*)?["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)/g;
  for (const match of source.matchAll(importPattern)) {
    imports.push(match[1] ?? match[2]);
  }
  return imports;
}

function resolveRelativeImport(importerPath, specifier) {
  if (!specifier.startsWith(".")) {
    return null;
  }
  return path.resolve(path.dirname(importerPath), specifier);
}

function isInsidePath(filePath, directoryPath) {
  const relativePath = path.relative(directoryPath, filePath);
  return relativePath === "" || (
    !relativePath.startsWith("..") && !path.isAbsolute(relativePath)
  );
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
