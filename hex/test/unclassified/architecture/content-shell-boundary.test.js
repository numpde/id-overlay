import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const CONTENT_DIR = repoPath("src/content");
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

// Unclassified: the loader may dynamically import the module entrypoint and
// pass ambient handles. It should not inspect page state, product state, DOM,
// storage, clipboard, or image data.
test("content loader remains a dumb dynamic-import bridge", () => {
  if (!fs.existsSync(CONTENT_LOADER)) {
    return;
  }

  assert.deepEqual(collectPatternViolations(CONTENT_LOADER, [
    {
      label: "product vocabulary",
      pattern: /\bsession\b|\breferenceImage\b|\bmode\b|\bpin\b|\bplacement\b/,
    },
    {
      label: "DOM ownership",
      pattern: /\bquerySelector\b|\bcreateElement\b|\baddEventListener\b/,
    },
    {
      label: "host work",
      pattern: /\bstorage\b|\bclipboard\b|\bFileReader\b|\bnew\s+Image\b/,
    },
  ]), []);
});

// Unclassified: product/user copy belongs behind application/UI view-model
// boundaries. If src/content contains final labels or status prose, the shell
// has started owning presentation decisions again.
test("content source does not own product copy", () => {
  assert.deepEqual(collectContentPatternViolations([
    {
      label: "primary/status copy",
      pattern: /Confirm clear|Clear image|No image loaded|Paste cancelled|image loaded|No image found/i,
    },
  ]), []);
});

// Unclassified: storage key placement is still unsettled, but the rushed shell
// hard-coded it next to DOM and paste code. This test keeps that smell visible
// until we decide whether it belongs in an extension adapter or bootstrap config.
test("content source does not define durable storage identity", () => {
  assert.deepEqual(collectContentPatternViolations([
    {
      label: "durable storage key",
      pattern: /STORAGE_KEY|id-overlay\.durable-state|id-overlay\/state/,
    },
  ]), []);
});

function collectContentPatternViolations(forbiddenPatterns) {
  const violations = [];
  for (const filePath of listJavaScriptFiles(CONTENT_DIR)) {
    violations.push(...collectPatternViolations(filePath, forbiddenPatterns));
  }
  return violations;
}

function collectPatternViolations(filePath, forbiddenPatterns) {
  const source = readSource(filePath);
  const violations = [];
  for (const { label, pattern } of forbiddenPatterns) {
    if (pattern.test(source)) {
      violations.push(`${relativeToRepo(filePath)} uses ${label}`);
    }
  }
  return violations;
}

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
