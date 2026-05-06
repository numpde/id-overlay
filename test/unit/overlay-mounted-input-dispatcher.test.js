import test from "node:test";
import assert from "node:assert/strict";

import { DRAG_MODE, WHEEL_MODE } from "../../src/core/interaction-policy.js";
import {
  createOverlayMountedInputDispatcher,
} from "../../src/content/overlay/mounted-input-dispatcher.js";

const NO_MODIFIERS = Object.freeze({
  shift: false,
  alt: false,
  ctrl: false,
  meta: false,
});

test("mounted input dispatcher consumes active drag moves", () => {
  const calls = [];
  const dispatcher = createDispatcher({
    calls,
    runtime: { activeGesture: { kind: DRAG_MODE.MOVE_OVERLAY } },
  });
  const event = createPointerEvent();

  dispatcher.handlePointerMove(event);

  assert.deepEqual(calls, [
    ["screen-point", event],
    ["move", { x: 10, y: 20 }],
    ["consume", event],
  ]);
});

test("mounted input dispatcher tracks hover when input projection allows it", () => {
  const calls = [];
  const dispatcher = createDispatcher({
    calls,
    projection: {
      pointerMove: { shouldTrackPointer: true },
    },
  });

  dispatcher.handlePointerMove(createPointerEvent({ buttons: 1 }));

  assert.deepEqual(calls, [
    ["screen-point", { clientX: 10, clientY: 20, button: 0, buttons: 1 }],
    ["projection", {
      screenPoint: { x: 10, y: 20 },
      pointer: {
        button: 0,
        buttons: 1,
        modifiers: NO_MODIFIERS,
      },
    }],
    ["move", { x: 10, y: 20 }],
  ]);
});

test("mounted input dispatcher clears stale hover when projection stops tracking", () => {
  const calls = [];
  const dispatcher = createDispatcher({
    calls,
    runtime: { pointer: { screenPx: { x: 1, y: 2 } } },
    projection: {
      pointerMove: { shouldTrackPointer: false },
    },
  });

  dispatcher.handlePointerMove(createPointerEvent());

  assert.deepEqual(calls, [
    ["screen-point", { clientX: 10, clientY: 20, button: 0, buttons: 0 }],
    ["projection", {
      screenPoint: { x: 10, y: 20 },
      pointer: {
        button: 0,
        buttons: 0,
        modifiers: NO_MODIFIERS,
      },
    }],
    ["leave"],
  ]);
});

test("mounted input dispatcher defers pointer move while a drag activation is pending", () => {
  const calls = [];
  const dispatcher = createDispatcher({
    calls,
    hasPendingPointerSequence: true,
  });

  dispatcher.handlePointerMove(createPointerEvent());

  assert.deepEqual(calls, []);
});

test("mounted input dispatcher starts owned pointer sequences and consumes activation", () => {
  const calls = [];
  const event = createPointerEvent({ button: 2, shiftKey: true });
  const dispatcher = createDispatcher({
    calls,
    projection: {
      pointerSequence: {
        shouldOwnPointerSequence: true,
        dragMode: DRAG_MODE.MOVE_OVERLAY,
      },
    },
  });

  dispatcher.handlePointerDown(event);

  assert.deepEqual(calls, [
    ["screen-point", event],
    ["projection", {
      screenPoint: { x: 10, y: 20 },
      pointer: {
        button: 2,
        buttons: 0,
        modifiers: {
          ...NO_MODIFIERS,
          shift: true,
        },
      },
    }],
    ["begin", {
      button: 2,
      dragMode: DRAG_MODE.MOVE_OVERLAY,
      startScreenPoint: { x: 10, y: 20 },
    }],
    ["consume", event],
  ]);
});

test("mounted input dispatcher consumes double-click only when pin toggle is handled", () => {
  const calls = [];
  const event = createPointerEvent();
  const dispatcher = createDispatcher({
    calls,
    projection: {
      activation: {
        shouldTogglePin: true,
      },
    },
  });

  dispatcher.handleDoubleClick(event);

  assert.deepEqual(calls, [
    ["screen-point", event],
    ["projection", { screenPoint: { x: 10, y: 20 } }],
    ["toggle-pin", { screenPoint: { x: 10, y: 20 } }],
    ["consume", event],
  ]);
});

test("mounted input dispatcher leaves unhandled double-clicks unconsumed", () => {
  const calls = [];
  const dispatcher = createDispatcher({
    calls,
    handleTogglePin: () => false,
    projection: {
      activation: {
        shouldTogglePin: true,
      },
    },
  });

  dispatcher.handleDoubleClick(createPointerEvent());

  assert.deepEqual(calls, [
    ["screen-point", { clientX: 10, clientY: 20, button: 0, buttons: 0 }],
    ["projection", { screenPoint: { x: 10, y: 20 } }],
    ["toggle-pin", { screenPoint: { x: 10, y: 20 } }],
  ]);
});

test("mounted input dispatcher consumes clicks only when activation policy says so", () => {
  const calls = [];
  const event = createPointerEvent();
  const dispatcher = createDispatcher({
    calls,
    projection: {
      activation: {
        shouldConsumeClick: true,
      },
    },
  });

  dispatcher.handleClick(event);

  assert.deepEqual(calls, [
    ["screen-point", event],
    ["projection", { screenPoint: { x: 10, y: 20 } }],
    ["consume", event],
  ]);
});

test("mounted input dispatcher handles and consumes intercepting wheel gestures", () => {
  const calls = [];
  const event = createWheelEvent({ deltaY: -120, ctrlKey: true });
  const dispatcher = createDispatcher({
    calls,
    projection: {
      wheel: {
        shouldHandle: true,
        shouldConsume: true,
        wheelMode: WHEEL_MODE.ROTATE_OVERLAY,
      },
    },
  });

  dispatcher.handleWheel(event);

  assert.deepEqual(calls, [
    ["screen-point", event],
    ["projection", {
      screenPoint: { x: 10, y: 20 },
      wheel: {
        modifiers: {
          ...NO_MODIFIERS,
          ctrl: true,
        },
      },
    }],
    ["wheel", {
      deltaY: -120,
      wheelMode: WHEEL_MODE.ROTATE_OVERLAY,
      screenPoint: { x: 10, y: 20 },
    }],
    ["consume", event],
  ]);
});

test("mounted input dispatcher leaves non-intercepting wheel gestures unconsumed", () => {
  const calls = [];
  const event = createWheelEvent();
  const dispatcher = createDispatcher({
    calls,
    projection: {
      wheel: {
        shouldHandle: true,
        shouldConsume: false,
        wheelMode: WHEEL_MODE.MAP_ZOOM,
      },
    },
  });

  dispatcher.handleWheel(event);

  assert.deepEqual(calls, [
    ["screen-point", event],
    ["projection", {
      screenPoint: { x: 10, y: 20 },
      wheel: {
        modifiers: NO_MODIFIERS,
      },
    }],
    ["wheel", {
      deltaY: 100,
      wheelMode: WHEEL_MODE.MAP_ZOOM,
      screenPoint: { x: 10, y: 20 },
    }],
  ]);
});

function createDispatcher({
  calls,
  runtime = {},
  projection = {},
  hasPendingPointerSequence = false,
  handleTogglePin = () => true,
  handleWheel = () => true,
}) {
  return createOverlayMountedInputDispatcher({
    getRuntimeState() {
      return runtime;
    },
    inputProjector: {
      screenPointFromEvent(event) {
        calls.push(["screen-point", event]);
        return { x: event.clientX, y: event.clientY };
      },
      resolveMountedInputProjection(screenPoint, options = {}) {
        calls.push(["projection", { screenPoint, ...options }]);
        return {
          pointerMove: { shouldTrackPointer: false },
          pointerSequence: { shouldOwnPointerSequence: false },
          activation: {
            shouldTogglePin: false,
            shouldConsumeClick: false,
          },
          wheel: {
            shouldHandle: false,
            shouldConsume: false,
            wheelMode: WHEEL_MODE.MAP_ZOOM,
          },
          ...projection,
        };
      },
    },
    overlayInteractions: {
      handlePointerMove(screenPoint) {
        calls.push(["move", screenPoint]);
      },
      handlePointerLeave() {
        calls.push(["leave"]);
      },
      handleTogglePin(payload) {
        calls.push(["toggle-pin", payload]);
        return handleTogglePin(payload);
      },
      handleWheel(payload) {
        calls.push(["wheel", payload]);
        return handleWheel(payload);
      },
    },
    pointerSequenceRouter: {
      hasPending() {
        return hasPendingPointerSequence;
      },
      begin(payload) {
        calls.push(["begin", payload]);
      },
    },
    consumeOverlayEvent(event) {
      calls.push(["consume", event]);
    },
  });
}

function createPointerEvent(overrides = {}) {
  return {
    clientX: 10,
    clientY: 20,
    button: 0,
    buttons: 0,
    ...overrides,
  };
}

function createWheelEvent(overrides = {}) {
  return {
    clientX: 10,
    clientY: 20,
    deltaY: 100,
    ...overrides,
  };
}
