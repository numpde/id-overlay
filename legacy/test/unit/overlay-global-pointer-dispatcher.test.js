import test from "node:test";
import assert from "node:assert/strict";

import { DRAG_MODE } from "../../src/core/interaction-policy.js";
import {
  createOverlayGlobalPointerDispatcher,
} from "../../src/content/overlay/global-pointer-dispatcher.js";

test("global pointer dispatcher advances pending sequences before active drag movement", () => {
  const calls = [];
  const event = createEvent("pointermove");
  const dispatcher = createDispatcher({
    calls,
    runtime: { activeGesture: { kind: DRAG_MODE.MOVE_OVERLAY } },
  });

  dispatcher.handlePointerMove(event);

  assert.deepEqual(calls, [
    ["screen-point", event],
    ["advance", { event, screenPoint: { x: 10, y: 20 } }],
    ["move", { x: 10, y: 20 }],
    ["consume", event],
  ]);
});

test("global pointer dispatcher stops when pending sequence consumes movement", () => {
  const calls = [];
  const event = createEvent("pointermove");
  const dispatcher = createDispatcher({
    calls,
    advanceGlobalPointerMove: () => false,
    runtime: { activeGesture: { kind: DRAG_MODE.MOVE_OVERLAY } },
  });

  dispatcher.handlePointerMove(event);

  assert.deepEqual(calls, [
    ["screen-point", event],
    ["advance", { event, screenPoint: { x: 10, y: 20 } }],
  ]);
});

test("global pointer dispatcher retargets listeners when no drag remains after movement", () => {
  const calls = [];
  const event = createEvent("pointermove");
  const dispatcher = createDispatcher({ calls });

  dispatcher.handlePointerMove(event);

  assert.deepEqual(calls, [
    ["screen-point", event],
    ["advance", { event, screenPoint: { x: 10, y: 20 } }],
    ["sync"],
  ]);
});

test("global pointer dispatcher consumes pending pointerup without ending a drag", () => {
  const calls = [];
  const event = createEvent("pointerup");
  const dispatcher = createDispatcher({
    calls,
    consumePendingPointerUp: () => true,
    runtime: { activeGesture: { kind: DRAG_MODE.MOVE_OVERLAY } },
  });

  dispatcher.handlePointerUp(event);

  assert.deepEqual(calls, [
    ["pending-up", event],
  ]);
});

test("global pointer dispatcher finishes active drags on pointerup", () => {
  const calls = [];
  const event = createEvent("pointerup");
  const dispatcher = createDispatcher({
    calls,
    runtime: { activeGesture: { kind: DRAG_MODE.MOVE_OVERLAY } },
  });

  dispatcher.handlePointerUp(event);

  assert.deepEqual(calls, [
    ["pending-up", event],
    ["screen-point", event],
    ["up", { x: 10, y: 20 }],
    ["consume", event],
  ]);
});

test("global pointer dispatcher retargets listeners when pointerup has no active drag", () => {
  const calls = [];
  const event = createEvent("pointerup");
  const dispatcher = createDispatcher({ calls });

  dispatcher.handlePointerUp(event);

  assert.deepEqual(calls, [
    ["pending-up", event],
    ["sync"],
  ]);
});

test("global pointer dispatcher cancels active and pending gestures", () => {
  const calls = [];
  const event = createEvent("pointercancel");
  const dispatcher = createDispatcher({ calls });

  dispatcher.handlePointerCancel(event);

  assert.deepEqual(calls, [
    ["clear"],
    ["cancel"],
    ["consume", event],
  ]);
});

test("global pointer dispatcher computes listener ownership from pending or active gestures", () => {
  assert.equal(
    createDispatcher({ calls: [] }).shouldListenGlobally(),
    false,
  );
  assert.equal(
    createDispatcher({
      calls: [],
      shouldListenGlobally: ({ hasActiveGesture }) => hasActiveGesture,
      runtime: { activeGesture: { kind: DRAG_MODE.MOVE_OVERLAY } },
    }).shouldListenGlobally(),
    true,
  );
  assert.equal(
    createDispatcher({
      calls: [],
      shouldListenGlobally: () => true,
    }).shouldListenGlobally(),
    true,
  );
});

function createDispatcher({
  calls,
  runtime = {},
  advanceGlobalPointerMove = () => true,
  consumePendingPointerUp = () => false,
  shouldListenGlobally = () => false,
}) {
  return createOverlayGlobalPointerDispatcher({
    getRuntimeState() {
      return runtime;
    },
    inputProjector: {
      screenPointFromEvent(event) {
        calls.push(["screen-point", event]);
        return { x: event.clientX, y: event.clientY };
      },
    },
    overlayInteractions: {
      handlePointerMove(screenPoint) {
        calls.push(["move", screenPoint]);
      },
      handlePointerUp(screenPoint) {
        calls.push(["up", screenPoint]);
      },
      handlePointerCancel() {
        calls.push(["cancel"]);
      },
    },
    pointerSequenceRouter: {
      advanceGlobalPointerMove(payload) {
        calls.push(["advance", payload]);
        return advanceGlobalPointerMove(payload);
      },
      consumePendingPointerUp(event) {
        calls.push(["pending-up", event]);
        return consumePendingPointerUp(event);
      },
      clear() {
        calls.push(["clear"]);
      },
      shouldListenGlobally(payload) {
        calls.push(["listen", payload]);
        return shouldListenGlobally(payload);
      },
    },
    consumeOverlayEvent(event) {
      calls.push(["consume", event]);
    },
    syncGlobalPointerListeners() {
      calls.push(["sync"]);
    },
  });
}

function createEvent(type) {
  return {
    type,
    clientX: 10,
    clientY: 20,
  };
}
