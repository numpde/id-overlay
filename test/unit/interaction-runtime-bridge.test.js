import test from "node:test";
import assert from "node:assert/strict";

import { DRAG_MODE } from "../../src/core/interaction-policy.js";
import {
  MACHINE_INPUT_OVERRIDE,
} from "../../src/core/machine/events.js";
import { createMachineHost } from "../../src/core/machine/host.js";
import {
  createInputInterruptedFact,
} from "../../src/core/machine/runtime-facts.js";
import { createInteractionRuntimeBridge } from "../../src/content/interactions/runtime-bridge.js";

const RUNTIME_ERROR_NOTICE = "runtime-error";

test("interaction runtime bridge reports runtime facts through the action port", () => {
  const { bridge, machineHost } = createRuntimeBridgeHarness();

  bridge.observePointer({ x: 10, y: 20 });
  assert.deepEqual(bridge.getPointerScreenPx(), { x: 10, y: 20 });

  bridge.observeGestureStart({ x: 11, y: 21 }, { gestureKind: DRAG_MODE.MAP_PAN });
  assert.deepEqual(machineHost.getState().runtime.activeGesture, {
    kind: DRAG_MODE.MAP_PAN,
  });
  assert.deepEqual(bridge.getPointerScreenPx(), { x: 11, y: 21 });

  bridge.observePassThroughPress();
  assert.equal(machineHost.getState().runtime.inputOverride, MACHINE_INPUT_OVERRIDE.PASS_THROUGH);

  bridge.observeGestureFinish({ x: 12, y: 22 });
  assert.equal(machineHost.getState().runtime.activeGesture, null);
  assert.deepEqual(bridge.getPointerScreenPx(), { x: 12, y: 22 });

  bridge.observePassThroughRelease();
  assert.equal(machineHost.getState().runtime.inputOverride, null);

  bridge.destroy();
});

test("interaction runtime bridge reset cancels adapter drag and resets machine runtime", () => {
  const { bridge, adapterDrag, machineHost } = createRuntimeBridgeHarness();

  bridge.observeGestureStart({ x: 10, y: 20 }, { gestureKind: DRAG_MODE.MOVE_OVERLAY });
  bridge.reset({
    endPointerScreenPx: { x: 30, y: 40 },
    pointerScreenPx: null,
  });

  assert.deepEqual(adapterDrag.cancelCalls, [{
    screenPoint: { x: 30, y: 40 },
    options: { commitPlacement: true },
  }]);
  assert.equal(machineHost.getState().runtime.activeGesture, null);
  assert.equal(machineHost.getState().runtime.pointer.screenPx, null);

  bridge.destroy();
});

test("interaction runtime bridge subscriber emits only meaningful runtime changes", () => {
  const { bridge, machineHost } = createRuntimeBridgeHarness();
  const observedRuntime = [];
  const unsubscribe = bridge.subscribe((runtime) => {
    observedRuntime.push(runtime);
  });

  machineHost.reportStatusNotice({
    noticeKind: RUNTIME_ERROR_NOTICE,
    noticePayload: { error: { message: "ignored for runtime projection" } },
  });
  bridge.observePointer({ x: 1, y: 2 });

  assert.equal(observedRuntime.length, 2);
  assert.equal(observedRuntime[0].pointer.screenPx, null);
  assert.deepEqual(observedRuntime[1].pointer.screenPx, { x: 1, y: 2 });

  unsubscribe();
  bridge.observePointer({ x: 3, y: 4 });
  assert.equal(observedRuntime.length, 2);

  bridge.destroy();
});

test("interaction runtime bridge cancels active adapter drag when machine runtime ends elsewhere", () => {
  const { bridge, adapterDrag, machineHost } = createRuntimeBridgeHarness({
    hasActiveAdapterDrag: true,
  });

  bridge.observeGestureStart({ x: 50, y: 60 }, { gestureKind: DRAG_MODE.MAP_PAN });
  machineHost.observeRuntimeFact(createInputInterruptedFact({
    pointerScreenPx: { x: 70, y: 80 },
  }));

  assert.deepEqual(adapterDrag.cancelCalls, [{
    screenPoint: { x: 50, y: 60 },
    options: { commitPlacement: false },
  }]);

  bridge.destroy();
});

test("interaction runtime bridge destroy removes machine runtime observer", () => {
  const { bridge, adapterDrag, machineHost } = createRuntimeBridgeHarness({
    hasActiveAdapterDrag: true,
  });

  bridge.observeGestureStart({ x: 50, y: 60 }, { gestureKind: DRAG_MODE.MAP_PAN });
  bridge.destroy();
  machineHost.observeRuntimeFact(createInputInterruptedFact({ pointerScreenPx: null }));

  assert.deepEqual(adapterDrag.cancelCalls, []);
});

test("interaction runtime bridge destroy removes caller runtime subscriptions", () => {
  const { bridge } = createRuntimeBridgeHarness();
  const observedRuntime = [];

  bridge.subscribe((runtime) => {
    observedRuntime.push(runtime);
  }, { emitCurrent: false });
  bridge.destroy();
  bridge.observePointer({ x: 10, y: 20 });

  assert.deepEqual(observedRuntime, []);
});

test("interaction runtime bridge subscribe after destroy is inert", () => {
  const { bridge } = createRuntimeBridgeHarness();
  const observedRuntime = [];

  bridge.destroy();
  const unsubscribe = bridge.subscribe((runtime) => {
    observedRuntime.push(runtime);
  });
  bridge.observePointer({ x: 10, y: 20 });
  unsubscribe();

  assert.deepEqual(observedRuntime, []);
});

function createRuntimeBridgeHarness({ hasActiveAdapterDrag = false } = {}) {
  const machineHost = createMachineHost();
  let adapterDragActive = hasActiveAdapterDrag;
  const adapterDrag = {
    cancelCalls: [],
    hasActive() {
      return adapterDragActive;
    },
    cancel(screenPoint, options) {
      this.cancelCalls.push({ screenPoint, options });
      adapterDragActive = false;
    },
  };
  const bridge = createInteractionRuntimeBridge({
    machineHost,
    machineActions: createRuntimeMachineActions(machineHost),
    adapterDrag,
  });
  return {
    adapterDrag,
    bridge,
    machineHost,
  };
}

function createRuntimeMachineActions(machineHost) {
  return {
    observeRuntimeFact: machineHost.observeRuntimeFact,
  };
}
