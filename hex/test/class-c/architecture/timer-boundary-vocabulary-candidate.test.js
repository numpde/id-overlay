import test from "node:test";
import assert from "node:assert/strict";

import {
  hexPath,
  listJavaScriptFiles,
  readSource,
  relativeToRepo,
} from "../../class-a/architecture/source-files.js";

// Class-c: delayed app behavior may ultimately be represented as scheduled
// application commands instead of product-specific schedule/expiry effects.
// Current class-a effect vocabulary still exposes `schedule-clear-*` effects,
// so this source-scan is aspirational until that cut-over happens.
//
// Decision: keep quarantined with the timer-port and scheduled-command effect
// candidates. Promoting it now would contradict stable effect law.
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
