import test from "node:test";
import assert from "node:assert/strict";

import {
  hexPath,
  listJavaScriptFiles,
  readSource,
  relativeToRepo,
} from "../../class-a/architecture/source-files.js";
import {
  createFlowTrace,
  flowEdge,
} from "../../support/flow-trace.js";

// Class-b, deliberately not class-a: this is a source-level guard over today's
// files. It protects the timer cut-over by banning the old shape where runtime
// timer facts re-entered product code and bootstrap translated timer purposes
// into product commands.
test("application and bootstrap do not expose timer-fired product vocabulary", () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "application and bootstrap do not expose timer-fired product vocabulary",
  });
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
  trace.edge(flowEdge("check.timer-boundary-vocabulary", "sink.architecture-boundary", {
    terminal: "architecture-check",
  }));
});

const FORBIDDEN_TIMER_PRODUCT_VOCABULARY = Object.freeze([
  "timer-fired",
  "purpose:",
  "clear-status-notice\"()",
  "clear-panel-intent\"()",
]);
