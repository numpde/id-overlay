import test from "node:test";
import assert from "node:assert/strict";

import { RUNTIME_ERROR_SOURCE } from "../../src/core/runtime-error.js";
import { createInteractionErrorBoundary } from "../../src/content/interactions/error-boundary.js";

test("interaction error boundary recovers handled interaction failures and returns false", () => {
  const harness = createErrorBoundaryHarness();
  const error = new Error("adapter exploded");

  const result = harness.boundary.runHandledInteraction("handle-toggle-pin", () => {
    throw error;
  });

  assert.equal(result, false);
  assert.equal(harness.resetCalls, 1);
  assert.deepEqual(harness.reportedErrors, [{
    source: RUNTIME_ERROR_SOURCE.INTERACTIONS,
    operation: "handle-toggle-pin",
    recoverable: true,
    name: "Error",
    message: "adapter exploded",
    details: null,
  }]);
  assert.equal(harness.loggedErrors.length, 1);
  assert.equal(harness.loggedErrors[0].originalError, error);
});

test("interaction error boundary can report failures without recovery", () => {
  const harness = createErrorBoundaryHarness();
  const error = new Error("overlay exploded");

  const runtimeError = harness.boundary.reportFailure({
    source: RUNTIME_ERROR_SOURCE.OVERLAY,
    operation: "global-pointer-move",
    error,
  });

  assert.equal(harness.resetCalls, 0);
  assert.equal(runtimeError.source, RUNTIME_ERROR_SOURCE.OVERLAY);
  assert.equal(runtimeError.operation, "global-pointer-move");
  assert.deepEqual(harness.reportedErrors[0], runtimeError);
});

test("interaction error boundary exposes explicit recovery for external boundaries", () => {
  const harness = createErrorBoundaryHarness();
  const error = new Error("overlay exploded");

  const runtimeError = harness.boundary.recoverFromFailure({
    source: RUNTIME_ERROR_SOURCE.OVERLAY,
    operation: "global-pointer-move",
    error,
  });

  assert.equal(harness.resetCalls, 1);
  assert.equal(runtimeError.source, RUNTIME_ERROR_SOURCE.OVERLAY);
  assert.deepEqual(harness.reportedErrors[0], runtimeError);
});

function createErrorBoundaryHarness() {
  const harness = {
    reportedErrors: [],
    loggedErrors: [],
    resetCalls: 0,
  };
  harness.boundary = createInteractionErrorBoundary({
    reportRuntimeError(runtimeError) {
      harness.reportedErrors.push(runtimeError);
    },
    recoverInteraction() {
      harness.resetCalls += 1;
    },
    logger: {
      error(message, runtimeError, originalError) {
        harness.loggedErrors.push({ message, runtimeError, originalError });
      },
    },
  });
  return harness;
}
