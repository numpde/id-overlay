import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const CONTENT_DIR = repoPath("src/content");

// Class-b: this is a durable shell boundary, but the browser-shell layout is
// still provisional. Content code may pass ambient browser handles into
// bootstrap; it must not become the place that steps product state or selects
// product views.
test("content source does not own product stepping", () => {
  assert.deepEqual(collectContentVocabularyViolations([
    "APPLICATION_COMMAND_KIND",
    "createApplicationCommand",
    "handleApplicationCommand",
    "selectApplicationView",
    "createInitialApplicationState",
    "durable-state-changed",
  ]), []);
});

function collectContentVocabularyViolations(words) {
  return collectContentPatternViolations(words.map((word) => ({
    label: word,
    pattern: new RegExp(`\\b${escapeRegExp(word)}\\b`),
  })));
}

function collectContentPatternViolations(forbiddenPatterns) {
  const violations = [];
  for (const filePath of listJavaScriptFiles(CONTENT_DIR)) {
    const source = fs.readFileSync(filePath, "utf8");
    for (const { label, pattern } of forbiddenPatterns) {
      if (pattern.test(source)) {
        violations.push(`${relativeToRepo(filePath)} uses ${label}`);
      }
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

function repoPath(...segments) {
  return path.join(REPO_ROOT, ...segments);
}

function relativeToRepo(filePath) {
  return path.relative(REPO_ROOT, filePath);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
