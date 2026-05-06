import test from "node:test";
import assert from "node:assert/strict";

import {
  consumeOverlayEvent,
  createOverlayEventBoundary,
  isForwardedMapGestureEvent,
} from "../../src/content/overlay/event-boundary.js";
import { FORWARDED_MAP_GESTURE_EVENT_FLAG } from "../../src/content/page-adapter.js";
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
      resetInteraction: true,
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

test("overlay event helpers identify forwarded map gestures and consume DOM events", () => {
  const calls = [];
  const event = createConsumableEvent(calls);
  event[FORWARDED_MAP_GESTURE_EVENT_FLAG] = true;

  assert.equal(isForwardedMapGestureEvent(event), true);
  assert.equal(isForwardedMapGestureEvent({}), false);

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
