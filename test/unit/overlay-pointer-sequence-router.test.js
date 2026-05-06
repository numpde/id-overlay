import test from "node:test";
import assert from "node:assert/strict";

import { DRAG_MODE } from "../../src/core/interaction-policy.js";
import { createOverlayPointerSequenceRouter } from "../../src/content/overlay/pointer-sequence-router.js";

test("overlay pointer sequence router activates pending drags through overlay interactions", () => {
  const calls = [];
  const router = createRouter({ calls });

  router.begin({
    button: 0,
    dragMode: DRAG_MODE.MOVE_OVERLAY,
    startScreenPoint: { x: 100, y: 100 },
  });
  const shouldContinue = router.advanceGlobalPointerMove({
    event: createEvent("move"),
    screenPoint: { x: 104, y: 104 },
  });

  assert.equal(shouldContinue, true);
  assert.deepEqual(calls, [
    ["change"],
    ["change"],
    ["move", { x: 100, y: 100 }],
    ["down", {
      button: 0,
      screenPoint: { x: 100, y: 100 },
      dragMode: DRAG_MODE.MOVE_OVERLAY,
    }],
  ]);
  assert.equal(router.hasPending(), false);
});

test("overlay pointer sequence router consumes below-threshold global moves", () => {
  const calls = [];
  const router = createRouter({ calls });
  const event = createEvent("move");

  router.begin({
    button: 0,
    dragMode: DRAG_MODE.MAP_PAN,
    startScreenPoint: { x: 100, y: 100 },
  });
  const shouldContinue = router.advanceGlobalPointerMove({
    event,
    screenPoint: { x: 102, y: 102 },
  });

  assert.equal(shouldContinue, false);
  assert.equal(router.hasPending(), true);
  assert.deepEqual(calls, [
    ["change"],
    ["consume", event],
  ]);
});

test("overlay pointer sequence router consumes activation when interaction rejects drag start", () => {
  const calls = [];
  const router = createRouter({
    calls,
    handlePointerDown() {
      return false;
    },
  });
  const event = createEvent("move");

  router.begin({
    button: 0,
    dragMode: DRAG_MODE.MAP_PAN,
    startScreenPoint: { x: 100, y: 100 },
  });
  const shouldContinue = router.advanceGlobalPointerMove({
    event,
    screenPoint: { x: 104, y: 104 },
  });

  assert.equal(shouldContinue, false);
  assert.equal(router.hasPending(), false);
  assert.deepEqual(calls, [
    ["change"],
    ["change"],
    ["move", { x: 100, y: 100 }],
    ["down", {
      button: 0,
      screenPoint: { x: 100, y: 100 },
      dragMode: DRAG_MODE.MAP_PAN,
    }],
    ["consume", event],
  ]);
});

test("overlay pointer sequence router consumes pointerup only while pending", () => {
  const calls = [];
  const router = createRouter({ calls });
  const event = createEvent("up");

  assert.equal(router.consumePendingPointerUp(event), false);

  router.begin({
    button: 0,
    dragMode: DRAG_MODE.MAP_PAN,
    startScreenPoint: { x: 100, y: 100 },
  });

  assert.equal(router.consumePendingPointerUp(event), true);
  assert.equal(router.hasPending(), false);
  assert.deepEqual(calls, [
    ["change"],
    ["change"],
    ["consume", event],
  ]);
});

function createRouter({
  calls,
  handlePointerDown = () => true,
}) {
  return createOverlayPointerSequenceRouter({
    onChange() {
      calls.push(["change"]);
    },
    overlayInteractions: {
      handlePointerMove(screenPoint) {
        calls.push(["move", screenPoint]);
      },
      handlePointerDown(payload) {
        calls.push(["down", payload]);
        return handlePointerDown(payload);
      },
    },
    consumeOverlayEvent(event) {
      calls.push(["consume", event]);
    },
  });
}

function createEvent(type) {
  return { type };
}
