import test from "node:test";
import assert from "node:assert/strict";

import { DRAG_MODE } from "../../src/core/interaction-policy.js";
import {
  MACHINE_INPUT_OVERRIDE,
} from "../../src/core/machine/events.js";
import { createMachineHost } from "../../src/core/machine/host.js";
import {
  MACHINE_RUNTIME_FACT_KIND,
  createGestureBeganFact,
  createGestureEndedFact,
  createGestureMovedFact,
  createInputInterruptedFact,
  createInputPassThroughPressedFact,
  createInputPassThroughReleasedFact,
  createPointerClearedFact,
  createPointerObservedFact,
} from "../../src/core/machine/runtime-facts.js";
import {
  selectInputRuntimeObservationKey,
} from "../../src/core/machine/selectors.js";
import { createInitialMachineState } from "../../src/core/machine/state.js";

test("runtime fact builders normalize observed input lifecycle facts", () => {
  assert.deepEqual(createPointerObservedFact({ x: 1, y: 2 }), {
    kind: MACHINE_RUNTIME_FACT_KIND.POINTER_OBSERVED,
    screenPx: { x: 1, y: 2 },
  });
  assert.deepEqual(createPointerObservedFact({ x: Number.NaN, y: 2 }), {
    kind: MACHINE_RUNTIME_FACT_KIND.POINTER_OBSERVED,
    screenPx: null,
  });
  assert.deepEqual(createPointerClearedFact(), {
    kind: MACHINE_RUNTIME_FACT_KIND.POINTER_CLEARED,
    screenPx: null,
  });
  assert.deepEqual(createGestureBeganFact({
    screenPx: { x: 3, y: 4 },
    gestureKind: DRAG_MODE.MAP_PAN,
  }), {
    kind: MACHINE_RUNTIME_FACT_KIND.GESTURE_BEGAN,
    screenPx: { x: 3, y: 4 },
    gestureKind: DRAG_MODE.MAP_PAN,
  });
  assert.equal(createGestureMovedFact({
    gestureKind: "drag",
  }).gestureKind, null);
  assert.deepEqual(createGestureEndedFact({
    screenPx: { x: 5, y: 6 },
  }), {
    kind: MACHINE_RUNTIME_FACT_KIND.GESTURE_ENDED,
    screenPx: { x: 5, y: 6 },
  });
  assert.deepEqual(createInputPassThroughPressedFact(), {
    kind: MACHINE_RUNTIME_FACT_KIND.PASS_THROUGH_PRESSED,
  });
  assert.deepEqual(createInputPassThroughReleasedFact(), {
    kind: MACHINE_RUNTIME_FACT_KIND.PASS_THROUGH_RELEASED,
  });
  assert.deepEqual(createInputInterruptedFact({
    pointerScreenPx: { x: 7, y: 8 },
  }), {
    kind: MACHINE_RUNTIME_FACT_KIND.INPUT_INTERRUPTED,
    screenPx: { x: 7, y: 8 },
  });
});

test("machine host ingests runtime facts instead of exposing lifecycle mutation semantics", () => {
  const machineHost = createMachineHost();

  machineHost.observeRuntimeFact(createPointerObservedFact({ x: 500, y: 300 }));
  assert.deepEqual(machineHost.getState().runtime.pointer.screenPx, { x: 500, y: 300 });

  machineHost.observeRuntimeFact(createGestureBeganFact({
    screenPx: { x: 510, y: 305 },
    gestureKind: DRAG_MODE.MAP_PAN,
  }));
  assert.deepEqual(machineHost.getState().runtime.pointer.screenPx, { x: 510, y: 305 });
  assert.deepEqual(machineHost.getState().runtime.activeGesture, { kind: DRAG_MODE.MAP_PAN });

  machineHost.observeRuntimeFact(createInputPassThroughPressedFact());
  assert.equal(machineHost.getState().runtime.inputOverride, MACHINE_INPUT_OVERRIDE.PASS_THROUGH);

  machineHost.observeRuntimeFact(createGestureEndedFact({ screenPx: { x: 520, y: 310 } }));
  assert.equal(machineHost.getState().runtime.activeGesture, null);
  assert.deepEqual(machineHost.getState().runtime.pointer.screenPx, { x: 520, y: 310 });

  machineHost.observeRuntimeFact(createInputInterruptedFact({ pointerScreenPx: null }));
  assert.deepEqual(machineHost.getState().runtime, createInitialMachineState().runtime);
});

test("input runtime observation key changes only for observable input runtime facts", () => {
  const machineHost = createMachineHost();
  const initialKey = selectInputRuntimeObservationKey(machineHost.getState());

  machineHost.reportRuntimeError({ message: "not input runtime" });
  assert.equal(selectInputRuntimeObservationKey(machineHost.getState()), initialKey);

  machineHost.observeRuntimeFact(createPointerObservedFact({ x: 500, y: 300 }));
  const pointerKey = selectInputRuntimeObservationKey(machineHost.getState());
  assert.notEqual(pointerKey, initialKey);

  machineHost.observeRuntimeFact(createGestureBeganFact({
    screenPx: { x: 500, y: 300 },
    gestureKind: DRAG_MODE.MOVE_OVERLAY,
  }));
  const gestureKey = selectInputRuntimeObservationKey(machineHost.getState());
  assert.notEqual(gestureKey, pointerKey);

  machineHost.observeRuntimeFact(createInputPassThroughPressedFact());
  assert.notEqual(selectInputRuntimeObservationKey(machineHost.getState()), gestureKey);
});
