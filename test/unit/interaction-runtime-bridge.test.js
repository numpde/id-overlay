import test from "node:test";
import assert from "node:assert/strict";

import { DRAG_MODE } from "../../src/core/interaction-policy.js";
import {
  MACHINE_INPUT_OVERRIDE,
} from "../../src/core/machine/events.js";
import { createMachineHost } from "../../src/core/machine/host.js";
import { createInteractionRuntimeBridge } from "../../src/content/interactions/runtime-bridge.js";

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

test("interaction runtime bridge reports input interruption facts without adapter ownership", () => {
  const { bridge, machineHost } = createRuntimeBridgeHarness();

  bridge.observeGestureStart({ x: 10, y: 20 }, { gestureKind: DRAG_MODE.MOVE_OVERLAY });
  bridge.observeInputInterrupted({ pointerScreenPx: null });

  assert.equal(machineHost.getState().runtime.activeGesture, null);
  assert.equal(machineHost.getState().runtime.pointer.screenPx, null);

  bridge.destroy();
});

test("interaction runtime bridge subscriber emits only meaningful runtime changes with previous runtime", () => {
  const { bridge, machineHost } = createRuntimeBridgeHarness();
  const observedChanges = [];
  const unsubscribe = bridge.subscribe((runtime, previousRuntime) => {
    observedChanges.push({ runtime, previousRuntime });
  });

  machineHost.reportRuntimeError({ message: "ignored for runtime projection" });
  bridge.observePointer({ x: 1, y: 2 });

  assert.equal(observedChanges.length, 2);
  assert.equal(observedChanges[0].runtime.pointer.screenPx, null);
  assert.equal(observedChanges[0].previousRuntime, undefined);
  assert.deepEqual(observedChanges[1].runtime.pointer.screenPx, { x: 1, y: 2 });
  assert.equal(observedChanges[1].previousRuntime.pointer.screenPx, null);

  unsubscribe();
  bridge.observePointer({ x: 3, y: 4 });
  assert.equal(observedChanges.length, 2);

  bridge.destroy();
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

function createRuntimeBridgeHarness() {
  const machineHost = createMachineHost();
  const bridge = createInteractionRuntimeBridge({
    machineHost,
    machineActions: createRuntimeMachineActions(machineHost),
  });
  return {
    bridge,
    machineHost,
  };
}

function createRuntimeMachineActions(machineHost) {
  return {
    observeRuntimeFact: machineHost.observeRuntimeFact,
  };
}
