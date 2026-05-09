import test from "node:test";
import assert from "node:assert/strict";

import { RUNTIME_ERROR_SOURCE } from "../../src/core/runtime-error.js";
import { createInteractionRuntimeErrorReporter } from "../../src/content/interactions/runtime-error-reporter.js";

test("interaction runtime error reporter normalizes, reports, and logs one runtime error fact", () => {
  const harness = createReporterHarness();
  const error = new Error("adapter exploded");

  const runtimeError = harness.reporter.report({
    operation: "handle-wheel",
    error,
    details: { deltaY: 1 },
  });

  assert.deepEqual(runtimeError, {
    source: RUNTIME_ERROR_SOURCE.INTERACTIONS,
    operation: "handle-wheel",
    recoverable: true,
    name: "Error",
    message: "adapter exploded",
    details: { deltaY: 1 },
  });
  assert.deepEqual(harness.reportedErrors, [runtimeError]);
  assert.deepEqual(harness.loggedErrors, [{
    message: "Runtime boundary failed",
    runtimeError,
    originalError: error,
  }]);
});

test("interaction runtime error reporter preserves explicit runtime error metadata", () => {
  const harness = createReporterHarness();
  const error = new Error("overlay exploded");

  const runtimeError = harness.reporter.report({
    source: RUNTIME_ERROR_SOURCE.OVERLAY,
    operation: "global-pointer-move",
    error,
    message: "Could not handle overlay input",
    recoverable: false,
    details: { pointerId: 1 },
  });

  assert.deepEqual(runtimeError, {
    source: RUNTIME_ERROR_SOURCE.OVERLAY,
    operation: "global-pointer-move",
    recoverable: false,
    name: "Error",
    message: "Could not handle overlay input",
    details: { pointerId: 1 },
  });
  assert.deepEqual(harness.reportedErrors, [runtimeError]);
});

function createReporterHarness() {
  const harness = {
    reportedErrors: [],
    loggedErrors: [],
  };
  harness.reporter = createInteractionRuntimeErrorReporter({
    reportRuntimeError(runtimeError) {
      harness.reportedErrors.push(runtimeError);
    },
    logger: {
      error(message, runtimeError, originalError) {
        harness.loggedErrors.push({ message, runtimeError, originalError });
      },
    },
  });
  return harness;
}
