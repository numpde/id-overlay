import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const BOOTSTRAP_SOURCE = fs.readFileSync(repoPath("hex/bootstrap/index.js"), "utf8");

// Class-b, not class-a: this is a source-level architecture guard around a
// still-thin composition root. It promotes only the no-regret part of the old
// candidate: bootstrap may wire ports and application functions, but it must
// not recreate the product state shape or own user-facing product copy. The
// deleted candidate also required exact future collaborator names; that was
// brittle and would have forced fake imports before the shell is real.
test("browser bootstrap does not define product state or product copy", () => {
  assert.deepEqual(collectPatternViolations([
    {
      label: "inline product state shape",
      pattern: /\b(session|referenceImage|registration|placement|history|notice|inputOverride|mode|pins)\s*:/,
    },
    {
      label: "product copy",
      pattern: /Paste|Clear image|Clear pins|Trace|Align|Reload image|No image|cancelled/i,
    },
  ]), []);
});

function collectPatternViolations(forbiddenPatterns) {
  const violations = [];
  for (const { label, pattern } of forbiddenPatterns) {
    if (pattern.test(BOOTSTRAP_SOURCE)) {
      violations.push(`hex/bootstrap/index.js uses ${label}`);
    }
  }
  return violations;
}

function repoPath(...segments) {
  return path.join(REPO_ROOT, ...segments);
}
