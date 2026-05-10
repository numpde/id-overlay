import test from "node:test";
import assert from "node:assert/strict";
import {
  hexPath,
  listJavaScriptFiles,
  readSource,
  relativeToRepo,
} from "../../class-a/architecture/source-files.js";

// Class-b, deliberately not class-a: this is a source-level anti-regression
// guard around a still-thin composition layer. The no-regret boundary is narrow:
// bootstrap may wire ports and application functions, but it must not recreate
// product state shape or own user-facing product copy.
test("bootstrap source does not define product state or product copy", () => {
  assert.deepEqual(collectPatternViolations([
    {
      label: "inline product state shape",
      pattern: /\b(session|referenceImage|registration|placement|history|notice|inputOverride|mode|pins)\s*:/,
    },
    {
      label: "product copy",
      pattern: /["'`][^"'`]*(?:Paste|Clear image|Clear pins|Trace|Align|Reload image|No image|Paste cancelled)[^"'`]*["'`]/i,
    },
  ]), []);
});

function collectPatternViolations(forbiddenPatterns) {
  const violations = [];
  for (const filePath of listJavaScriptFiles(hexPath("bootstrap"))) {
    const source = readSource(filePath);
    for (const { label, pattern } of forbiddenPatterns) {
      if (pattern.test(source)) {
        violations.push(`${relativeToRepo(filePath)} uses ${label}`);
      }
    }
  }
  return violations;
}
