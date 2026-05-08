import test from "node:test";
import assert from "node:assert/strict";

import {
  consumeOverlayEvent,
  createOverlayEventBoundary,
} from "../../src/content/overlay/event-boundary.js";
import { RUNTIME_ERROR_SOURCE } from "../../src/core/runtime-error.js";

test("overlay event boundary reports overlay runtime errors and resets transient input state", () => {
  const calls = [];
  const event = createConsumableEvent(calls);
  const boundary = createOverlayEventBoundary({
    clearPendingPointerSequence() {
      calls.push(["clear"]);
    },
    syncGlobalPointerListeners() {
      calls.push(["sync"]);
    },
    reportRuntimeError(payload) {
      calls.push(["report", payload]);
    },
  });
  const error = new Error("boom");

  const result = boundary.run("mounted-pointer-move", event, () => {
    throw error;
  });

  assert.equal(result, undefined);
  assert.deepEqual(calls, [
    ["clear"],
    ["sync"],
    ["preventDefault"],
    ["stopPropagation"],
    ["stopImmediatePropagation"],
    ["report", {
      source: RUNTIME_ERROR_SOURCE.OVERLAY,
      operation: "mounted-pointer-move",
      error,
    }],
  ]);
});

test("overlay event boundary returns successful handler results", () => {
  const boundary = createOverlayEventBoundary({
    clearPendingPointerSequence() {
      throw new Error("should not clear");
    },
    syncGlobalPointerListeners() {
      throw new Error("should not sync");
    },
    reportRuntimeError() {
      throw new Error("should not report");
    },
  });

  assert.equal(boundary.run("mounted-click", null, () => 42), 42);
});

test("overlay event boundary delegates forwarded map gesture identity and consumes DOM events", () => {
  const calls = [];
  const event = createConsumableEvent(calls);
  const boundary = createOverlayEventBoundary({
    clearPendingPointerSequence() {
      throw new Error("should not clear");
    },
    syncGlobalPointerListeners() {
      throw new Error("should not sync");
    },
    reportRuntimeError() {
      throw new Error("should not report");
    },
    isForwardedMapGestureEvent(candidate) {
      return candidate === event;
    },
  });

  assert.equal(boundary.isForwardedMapGestureEvent(event), true);
  assert.equal(boundary.isForwardedMapGestureEvent({}), false);

  consumeOverlayEvent(event);
  assert.deepEqual(calls, [
    ["preventDefault"],
    ["stopPropagation"],
    ["stopImmediatePropagation"],
  ]);
});

function createConsumableEvent(calls) {
  return {
    preventDefault() {
      calls.push(["preventDefault"]);
    },
    stopPropagation() {
      calls.push(["stopPropagation"]);
    },
    stopImmediatePropagation() {
      calls.push(["stopImmediatePropagation"]);
    },
  };
}
