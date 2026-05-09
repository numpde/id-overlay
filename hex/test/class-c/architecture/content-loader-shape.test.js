import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const CONTENT_LOADER = repoPath("src/content/content-loader.js");

// Class-c: a dumb loader is attractive, but this test names one file and one
// loading strategy before the browser shell exists. Keep the smell visible
// without making the exact loader shape authoritative.
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

function collectPatternViolations(filePath, forbiddenPatterns) {
  const source = fs.readFileSync(filePath, "utf8");
  const violations = [];
  for (const { label, pattern } of forbiddenPatterns) {
    if (pattern.test(source)) {
      violations.push(`${relativeToRepo(filePath)} uses ${label}`);
    }
  }
  return violations;
}

function repoPath(...segments) {
  return path.join(REPO_ROOT, ...segments);
}

function relativeToRepo(filePath) {
  return path.relative(REPO_ROOT, filePath);
}
