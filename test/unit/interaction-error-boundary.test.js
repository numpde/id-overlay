import test from "node:test";
import assert from "node:assert/strict";

import { RUNTIME_ERROR_SOURCE } from "../../src/core/runtime-error.js";
import {
  MACHINE_EVENT_KIND,
  MACHINE_STATUS_NOTICE_KIND,
} from "../../src/core/machine/events.js";
import { createInteractionErrorBoundary } from "../../src/content/interactions/error-boundary.js";

// TODO(smell): This test expects content to report errors by constructing a
// status-notice machine command. After ingress is split, assert typed runtime
// failure facts and machine-owned status derivation instead.
test("interaction error boundary reports runtime status and returns fallback", () => {
  const harness = createErrorBoundaryHarness();
  const error = new Error("adapter exploded");

  const result = harness.boundary.run("handle-toggle-pin", () => {
    throw error;
  }, { fallbackValue: false });

  assert.equal(result, false);
  assert.equal(harness.resetCalls, 1);
  assert.equal(harness.dispatchedEvents.length, 1);
  assert.deepEqual(harness.dispatchedEvents[0], {
    type: MACHINE_EVENT_KIND.REPORT_STATUS_NOTICE,
    noticeKind: MACHINE_STATUS_NOTICE_KIND.RUNTIME_ERROR,
    noticePayload: {
      error: {
        source: RUNTIME_ERROR_SOURCE.INTERACTIONS,
        operation: "handle-toggle-pin",
        recoverable: true,
        name: "Error",
        message: "adapter exploded",
        details: null,
      },
    },
  });
  assert.equal(harness.loggedErrors.length, 1);
  assert.equal(harness.loggedErrors[0].originalError, error);
});

test("interaction error boundary can report overlay failures without resetting", () => {
  const harness = createErrorBoundaryHarness();
  const error = new Error("overlay exploded");

  const runtimeError = harness.boundary.report({
    source: RUNTIME_ERROR_SOURCE.OVERLAY,
    operation: "global-pointer-move",
    error,
    resetInteraction: false,
  });

  assert.equal(harness.resetCalls, 0);
  assert.equal(runtimeError.source, RUNTIME_ERROR_SOURCE.OVERLAY);
  assert.equal(runtimeError.operation, "global-pointer-move");
  assert.deepEqual(harness.dispatchedEvents[0].noticePayload.error, runtimeError);
});

function createErrorBoundaryHarness() {
  const harness = {
    dispatchedEvents: [],
    loggedErrors: [],
    resetCalls: 0,
  };
  harness.boundary = createInteractionErrorBoundary({
    dispatchMachine(event) {
      harness.dispatchedEvents.push(event);
    },
    resetInteraction() {
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
