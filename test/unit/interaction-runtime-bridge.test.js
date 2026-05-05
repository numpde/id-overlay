import test from "node:test";
import assert from "node:assert/strict";

import { DRAG_MODE } from "../../src/core/interaction-policy.js";
import {
  MACHINE_EVENT_KIND,
  MACHINE_INPUT_OVERRIDE,
  MACHINE_STATUS_NOTICE_KIND,
} from "../../src/core/machine/events.js";
import { createMachineHost } from "../../src/core/machine/host.js";
import { createInteractionRuntimeBridge } from "../../src/content/interactions/runtime-bridge.js";

test("interaction runtime bridge dispatches canonical runtime events", () => {
  const { bridge, machineHost } = createRuntimeBridgeHarness();

  bridge.updatePointer({ x: 10, y: 20 });
  assert.deepEqual(bridge.getPointerScreenPx(), { x: 10, y: 20 });

  bridge.beginGesture({ x: 11, y: 21 }, { gestureKind: DRAG_MODE.MAP_PAN });
  assert.deepEqual(machineHost.getState().runtime.activeGesture, {
    kind: DRAG_MODE.MAP_PAN,
  });
  assert.deepEqual(bridge.getPointerScreenPx(), { x: 11, y: 21 });

  bridge.setPassThrough(true);
  assert.equal(machineHost.getState().runtime.inputOverride, MACHINE_INPUT_OVERRIDE.PASS_THROUGH);

  bridge.endGesture({ x: 12, y: 22 });
  assert.equal(machineHost.getState().runtime.activeGesture, null);
  assert.deepEqual(bridge.getPointerScreenPx(), { x: 12, y: 22 });

  bridge.setPassThrough(false);
  assert.equal(machineHost.getState().runtime.inputOverride, null);

  bridge.destroy();
});

test("interaction runtime bridge reset cancels adapter drag and resets machine runtime", () => {
  const { bridge, adapterDrag, machineHost } = createRuntimeBridgeHarness();

  bridge.beginGesture({ x: 10, y: 20 }, { gestureKind: DRAG_MODE.MOVE_OVERLAY });
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

  machineHost.dispatch({
    type: MACHINE_EVENT_KIND.REPORT_STATUS_NOTICE,
    noticeKind: MACHINE_STATUS_NOTICE_KIND.RUNTIME_ERROR,
    noticePayload: { error: { message: "ignored for runtime projection" } },
  });
  bridge.updatePointer({ x: 1, y: 2 });

  assert.equal(observedRuntime.length, 2);
  assert.equal(observedRuntime[0].pointer.screenPx, null);
  assert.deepEqual(observedRuntime[1].pointer.screenPx, { x: 1, y: 2 });

  unsubscribe();
  bridge.updatePointer({ x: 3, y: 4 });
  assert.equal(observedRuntime.length, 2);

  bridge.destroy();
});

test("interaction runtime bridge cancels active adapter drag when machine runtime ends elsewhere", () => {
  const { bridge, adapterDrag, machineHost } = createRuntimeBridgeHarness({
    hasActiveAdapterDrag: true,
  });

  bridge.beginGesture({ x: 50, y: 60 }, { gestureKind: DRAG_MODE.MAP_PAN });
  machineHost.dispatch({
    type: MACHINE_EVENT_KIND.RESET_INPUT_RUNTIME,
    screenPx: { x: 70, y: 80 },
  });

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

  bridge.beginGesture({ x: 50, y: 60 }, { gestureKind: DRAG_MODE.MAP_PAN });
  bridge.destroy();
  machineHost.dispatch({
    type: MACHINE_EVENT_KIND.RESET_INPUT_RUNTIME,
    screenPx: null,
  });

  assert.deepEqual(adapterDrag.cancelCalls, []);
});

function createRuntimeBridgeHarness({ hasActiveAdapterDrag = false } = {}) {
  const machineHost = createMachineHost();
  const adapterDrag = {
    cancelCalls: [],
    hasActive() {
      return hasActiveAdapterDrag;
    },
    cancel(screenPoint, options) {
      this.cancelCalls.push({ screenPoint, options });
    },
  };
  const bridge = createInteractionRuntimeBridge({
    machineHost,
    adapterDrag,
  });
  return {
    adapterDrag,
    bridge,
    machineHost,
  };
}
