import test from "node:test";
import assert from "node:assert/strict";

import {
  hexPath,
  listJavaScriptFiles,
  readSource,
  relativeToRepo,
} from "../../class-a/architecture/source-files.js";

// Unclassified candidate: delayed app behavior should be represented as
// scheduled application commands, not as a second app-facing timer vocabulary.
// `timer-fired` is a browser-clock fact; if it reaches application/bootstrap
// product code, the shell has become a product meaning translator.
test("application and bootstrap do not expose timer-fired product vocabulary", () => {
  const violations = [];
  for (const filePath of [
    ...listJavaScriptFiles(hexPath("application")),
    ...listJavaScriptFiles(hexPath("bootstrap")),
  ]) {
    const source = readSource(filePath);
    for (const forbidden of FORBIDDEN_TIMER_PRODUCT_VOCABULARY) {
      if (source.includes(forbidden)) {
        violations.push(`${relativeToRepo(filePath)} contains ${forbidden}`);
      }
    }
  }

  assert.deepEqual(violations, []);
});

const FORBIDDEN_TIMER_PRODUCT_VOCABULARY = Object.freeze([
  "timer-fired",
  "purpose:",
  "clear-status-notice\"()",
  "clear-panel-intent\"()",
]);
