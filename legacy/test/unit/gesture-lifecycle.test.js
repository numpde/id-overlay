import test from "node:test";
import assert from "node:assert/strict";

import { DRAG_MODE } from "../../src/core/interaction-policy.js";
import { createMachineHost } from "../../src/core/machine/host.js";
import { createGestureLifecycle } from "../../src/content/interactions/gesture-lifecycle.js";
import { createInteractionRuntimeBridge } from "../../src/content/interactions/runtime-bridge.js";

test("gesture lifecycle begins runtime only after adapter drag accepts", () => {
  const { lifecycle, adapterDrag, machineHost } = createLifecycleHarness();

  assert.equal(lifecycle.begin({
    button: 0,
    screenPoint: { x: 10, y: 20 },
    dragMode: DRAG_MODE.MAP_PAN,
  }), true);

  assert.deepEqual(adapterDrag.beginCalls, [{
    button: 0,
    screenPoint: { x: 10, y: 20 },
    dragMode: DRAG_MODE.MAP_PAN,
  }]);
  assert.deepEqual(machineHost.getState().runtime.activeGesture, {
    kind: DRAG_MODE.MAP_PAN,
  });
  assert.deepEqual(machineHost.getState().runtime.pointer.screenPx, { x: 10, y: 20 });
});

test("gesture lifecycle leaves runtime untouched when adapter drag rejects", () => {
  const { lifecycle, machineHost } = createLifecycleHarness({
    beginReturns: false,
  });

  assert.equal(lifecycle.begin({
    button: 0,
    screenPoint: { x: 10, y: 20 },
    dragMode: DRAG_MODE.MAP_PAN,
  }), false);

  assert.equal(machineHost.getState().runtime.activeGesture, null);
  assert.equal(machineHost.getState().runtime.pointer.screenPx, null);
});

test("gesture lifecycle moves and finishes the active adapter drag with matching runtime observations", () => {
  const { lifecycle, adapterDrag, machineHost } = createLifecycleHarness();

  lifecycle.begin({
    button: 0,
    screenPoint: { x: 10, y: 20 },
    dragMode: DRAG_MODE.MOVE_OVERLAY,
  });

  assert.equal(lifecycle.move({ x: 30, y: 40 }), true);
  assert.deepEqual(adapterDrag.moveCalls, [{ x: 30, y: 40 }]);
  assert.deepEqual(machineHost.getState().runtime.activeGesture, {
    kind: DRAG_MODE.MOVE_OVERLAY,
  });
  assert.deepEqual(machineHost.getState().runtime.pointer.screenPx, { x: 30, y: 40 });

  assert.equal(lifecycle.finish({ x: 50, y: 60 }), true);
  assert.deepEqual(adapterDrag.endCalls, [{ x: 50, y: 60 }]);
  assert.equal(machineHost.getState().runtime.activeGesture, null);
  assert.deepEqual(machineHost.getState().runtime.pointer.screenPx, { x: 50, y: 60 });
});

test("gesture lifecycle ignores moves and finishes without an active drag", () => {
  const { lifecycle, adapterDrag, machineHost } = createLifecycleHarness();

  assert.equal(lifecycle.move({ x: 30, y: 40 }), false);
  assert.equal(lifecycle.finish({ x: 50, y: 60 }), false);

  assert.deepEqual(adapterDrag.moveCalls, []);
  assert.deepEqual(adapterDrag.endCalls, []);
  assert.equal(machineHost.getState().runtime.activeGesture, null);
  assert.equal(machineHost.getState().runtime.pointer.screenPx, null);
});

test("gesture lifecycle observes pointer movement when no drag is active", () => {
  const { lifecycle, adapterDrag, machineHost } = createLifecycleHarness();

  assert.equal(lifecycle.moveOrObservePointer({ x: 30, y: 40 }), true);

  assert.deepEqual(adapterDrag.moveCalls, []);
  assert.equal(machineHost.getState().runtime.activeGesture, null);
  assert.deepEqual(machineHost.getState().runtime.pointer.screenPx, { x: 30, y: 40 });
});

test("gesture lifecycle clears pointer only while idle", () => {
  const { lifecycle, machineHost } = createLifecycleHarness();

  lifecycle.moveOrObservePointer({ x: 30, y: 40 });
  assert.equal(lifecycle.clearPointerIfIdle(), true);
  assert.equal(machineHost.getState().runtime.pointer.screenPx, null);

  lifecycle.begin({
    button: 0,
    screenPoint: { x: 10, y: 20 },
    dragMode: DRAG_MODE.MOVE_OVERLAY,
  });
  assert.equal(lifecycle.clearPointerIfIdle(), false);
  assert.deepEqual(machineHost.getState().runtime.pointer.screenPx, { x: 10, y: 20 });
});

test("gesture lifecycle reset cancels adapter drag and interrupts runtime atomically", () => {
  const { lifecycle, adapterDrag, machineHost } = createLifecycleHarness();

  lifecycle.begin({
    button: 0,
    screenPoint: { x: 10, y: 20 },
    dragMode: DRAG_MODE.MOVE_OVERLAY,
  });
  lifecycle.reset({
    endPointerScreenPx: { x: 30, y: 40 },
    pointerScreenPx: null,
  });

  assert.deepEqual(adapterDrag.cancelCalls, [{
    screenPoint: { x: 30, y: 40 },
    options: { commitPlacement: true },
  }]);
  assert.equal(machineHost.getState().runtime.activeGesture, null);
  assert.equal(machineHost.getState().runtime.pointer.screenPx, null);
});

test("gesture lifecycle releases adapter drag from an explicit runtime interruption input", () => {
  const { lifecycle, adapterDrag, machineHost } = createLifecycleHarness();

  lifecycle.begin({
    button: 0,
    screenPoint: { x: 50, y: 60 },
    dragMode: DRAG_MODE.MAP_PAN,
  });
  const previousRuntime = machineHost.getState().runtime;
  machineHost.observeInputInterrupted({
    pointerScreenPx: { x: 70, y: 80 },
  });
  lifecycle.handleRuntimeChange({
    previousRuntime,
    nextRuntime: machineHost.getState().runtime,
  });

  assert.deepEqual(adapterDrag.cancelCalls, [{
    screenPoint: { x: 50, y: 60 },
    options: { commitPlacement: false },
  }]);
});

test("gesture lifecycle ignores runtime interruption after adapter drag has already ended", () => {
  const { lifecycle, adapterDrag, machineHost } = createLifecycleHarness();

  lifecycle.begin({
    button: 0,
    screenPoint: { x: 50, y: 60 },
    dragMode: DRAG_MODE.MAP_PAN,
  });
  adapterDrag.end({ x: 50, y: 60 });
  const previousRuntime = machineHost.getState().runtime;
  machineHost.observeInputInterrupted({ pointerScreenPx: null });
  lifecycle.handleRuntimeChange({
    previousRuntime,
    nextRuntime: machineHost.getState().runtime,
  });

  assert.deepEqual(adapterDrag.cancelCalls, []);
});

function createLifecycleHarness({
  beginReturns = true,
} = {}) {
  const machineHost = createMachineHost();
  const runtimeBridge = createInteractionRuntimeBridge({
    machineHost,
    runtimeActions: machineHost.interactionActions,
  });
  let adapterDragActive = false;
  const adapterDrag = {
    beginCalls: [],
    moveCalls: [],
    endCalls: [],
    cancelCalls: [],
    begin(payload) {
      this.beginCalls.push(payload);
      adapterDragActive = beginReturns;
      return beginReturns;
    },
    move(screenPoint) {
      this.moveCalls.push(screenPoint);
    },
    end(screenPoint) {
      this.endCalls.push(screenPoint);
      adapterDragActive = false;
      return true;
    },
    cancel(screenPoint, options) {
      this.cancelCalls.push({ screenPoint, options });
      adapterDragActive = false;
    },
    hasActive() {
      return adapterDragActive;
    },
    getActiveDragMode() {
      return adapterDragActive ? DRAG_MODE.MOVE_OVERLAY : null;
    },
  };
  const lifecycle = createGestureLifecycle({
    adapterDrag,
    runtimeBridge,
  });
  return {
    adapterDrag,
    lifecycle,
    machineHost,
    runtimeBridge,
  };
}
