import test from "node:test";
import assert from "node:assert/strict";

import { createInteractionController } from "../../src/content/interaction-controller.js";
import {
  DRAG_MODE,
  isKnownDragMode,
  isKnownWheelMode,
  isMapPanDragMode,
  KEYBOARD_SHORTCUT_ACTION,
  resolveDragMode,
  resolveWheelMode,
  WHEEL_MODE,
} from "../../src/core/interaction-policy.js";
import { resolveInputProjection } from "../../src/core/input-projection.js";
import { RUNTIME_ERROR_SOURCE } from "../../src/core/runtime-error.js";
import {
  SESSION_MODE,
  createEmptySession,
} from "../../src/core/session.js";
import {
  MACHINE_EVENT_KIND,
  MACHINE_HISTORY_KIND,
  MACHINE_INPUT_OVERRIDE,
  MACHINE_STATUS_NOTICE_KIND,
} from "../../src/core/machine/events.js";
import { createMachineHost } from "../../src/core/machine/host.js";
import {
  selectPanelStatusText,
} from "../../src/core/machine/selectors.js";
import { createInitialMachineState } from "../../src/core/machine/state.js";
import {
  createPlacementScreenTransform,
  createPlacementTransform,
  derivePlacementFromScreenTransform,
  imagePointToRenderedScreenPoint,
  imagePointToScreenPoint,
  resolveOverlayScreenTransform,
  screenPointToImagePoint,
} from "../../src/core/transform.js";

// TODO(smell): These tests exercise interaction behavior through the current
// low-level dispatch/event vocabulary and monolithic page adapter. Replace the
// harness with public user/fact ingress once content no longer authors mutation
// commands directly.
const TEST_IMAGE = Object.freeze({
  src: "data:image/png;base64,abc",
  width: 800,
  height: 400,
});

test("shift-dragging updates placement through the adapter only", () => {
  const harness = createHarness();
  const { controller, machineHost } = harness;
  seedMachineImageSession(harness);

  controller.handlePointerDown({
    button: 0,
    screenPoint: { x: 500, y: 300 },
    dragMode: DRAG_MODE.MOVE_OVERLAY,
  });
  controller.handlePointerMove({ x: 560, y: 280 });
  controller.handlePointerUp({ x: 560, y: 280 });

  const nextTransform = createPlacementScreenTransform({
    snapshot: {
      viewportRect: { left: 100, top: 100, width: 800, height: 400 },
      mapView: { center: { lat: -1.23, lon: 36.84 }, zoom: 16 },
    },
    placement: getSession(harness).placement,
  });
  assert.deepEqual(imagePointToScreenPoint({
    imagePoint: { x: 400, y: 200 },
    transform: nextTransform,
  }), { x: 560, y: 280 });

  assert.equal(
    consumeHistory(machineHost, MACHINE_EVENT_KIND.UNDO).kind,
    MACHINE_HISTORY_KIND.MOVE_OVERLAY,
  );
  const undoneTransform = createPlacementScreenTransform({
    snapshot: {
      viewportRect: { left: 100, top: 100, width: 800, height: 400 },
      mapView: { center: { lat: -1.23, lon: 36.84 }, zoom: 16 },
    },
    placement: getSession(harness).placement,
  });
  assert.deepEqual(imagePointToScreenPoint({
    imagePoint: { x: 400, y: 200 },
    transform: undoneTransform,
  }), { x: 500, y: 300 });

  assert.equal(
    consumeHistory(machineHost, MACHINE_EVENT_KIND.REDO).kind,
    MACHINE_HISTORY_KIND.MOVE_OVERLAY,
  );
  const redoneTransform = createPlacementScreenTransform({
    snapshot: {
      viewportRect: { left: 100, top: 100, width: 800, height: 400 },
      mapView: { center: { lat: -1.23, lon: 36.84 }, zoom: 16 },
    },
    placement: getSession(harness).placement,
  });
  assert.deepEqual(imagePointToScreenPoint({
    imagePoint: { x: 400, y: 200 },
    transform: redoneTransform,
  }), { x: 560, y: 280 });
});

test("shift-dragging stays anchored to the visible overlay under live surface motion", () => {
  const surfaceMotionSnapshot = {
    viewportRect: { left: 100, top: 100, width: 800, height: 400 },
    mapView: { center: { lat: -1.23, lon: 36.84 }, zoom: 16 },
    surfaceMotion: {
      transformCss: "matrix(1, 0, 0, 1, 18, -12)",
      transformOriginCss: "0px 0px",
    },
  };
  const harness = createHarness({
    snapshot: surfaceMotionSnapshot,
  });
  const { controller, pageAdapter } = harness;
  seedMachineImageSession(harness);

  const beforeTransform = resolveOverlayScreenTransform({
    state: getSession(harness),
    snapshot: pageAdapter.getSnapshot(),
  });
  const startScreenPoint = imagePointToRenderedScreenPoint({
    imagePoint: { x: 400, y: 200 },
    transform: beforeTransform,
    snapshot: pageAdapter.getSnapshot(),
  });
  const endScreenPoint = {
    x: startScreenPoint.x + 60,
    y: startScreenPoint.y - 20,
  };

  controller.handlePointerDown({
    button: 0,
    screenPoint: startScreenPoint,
    dragMode: DRAG_MODE.MOVE_OVERLAY,
  });
  controller.handlePointerMove(endScreenPoint);
  controller.handlePointerUp(endScreenPoint);

  const afterTransform = resolveOverlayScreenTransform({
    state: getSession(harness),
    snapshot: pageAdapter.getSnapshot(),
  });
  const afterCenterScreenPoint = imagePointToRenderedScreenPoint({
    imagePoint: { x: 400, y: 200 },
    transform: afterTransform,
    snapshot: pageAdapter.getSnapshot(),
  });

  assert.ok(Math.abs(afterCenterScreenPoint.x - endScreenPoint.x) < 1e-9);
  assert.ok(Math.abs(afterCenterScreenPoint.y - endScreenPoint.y) < 1e-9);
});

test("plain drag uses the map-pan adapter path and keeps placement unchanged", () => {
  const harness = createHarness();
  const { controller, adapterCalls } = harness;
  seedMachineImageSession(harness);
  const initialPlacement = getSession(harness).placement;

  controller.handlePointerDown({
    button: 0,
    screenPoint: { x: 500, y: 300 },
    dragMode: DRAG_MODE.MAP_PAN,
  });
  controller.handlePointerMove({ x: 520, y: 310 });
  controller.handlePointerUp({ x: 520, y: 310 });

  assert.deepEqual(getSession(harness).placement, initialPlacement);
  assert.deepEqual(adapterCalls.mapPan.starts, [{ x: 500, y: 300 }]);
  assert.deepEqual(adapterCalls.mapPan.moves, [
    {
      screenPoint: { x: 520, y: 310 },
    },
    {
      screenPoint: { x: 520, y: 310 },
    },
  ]);
  assert.deepEqual(adapterCalls.mapPan.ends, [{ x: 520, y: 310 }]);
});

test("pin-toggle command adds a pin at the correct image and map coordinates", () => {
  const harness = createHarness();
  const { controller } = harness;
  seedMachineImageSession(harness);

  const handled = controller.handleTogglePin({ screenPoint: { x: 600, y: 320 } });
  assert.equal(handled, true);
  assert.equal(getSession(harness).registration.pins.length, 1);
  assert.deepEqual(getSession(harness).registration.pins[0], {
    id: 1,
    imagePx: { x: 500, y: 220 },
    mapLatLon: { lat: -1.03, lon: 37.84 },
  });
});

test("interaction boundaries report machine status instead of throwing raw adapter failures", () => {
  const harness = createHarness({
    screenToMapThrows: new Error("adapter exploded"),
  });
  const { controller, machineHost } = harness;
  seedMachineImageSession(harness);

  const handled = controller.handleTogglePin({ screenPoint: { x: 600, y: 320 } });

  assert.equal(handled, false);
  assert.equal(machineHost.getState().status.notice.kind, MACHINE_STATUS_NOTICE_KIND.RUNTIME_ERROR);
  assert.equal(machineHost.getState().status.notice.payload.error.source, RUNTIME_ERROR_SOURCE.INTERACTIONS);
  assert.equal(machineHost.getState().status.notice.payload.error.operation, "handle-toggle-pin");
  assert.equal(selectPanelStatusText(machineHost.getState()), "The overlay interaction failed. Try the action again.");
});

test("keyboard pin toggle uses the same interaction error boundary", () => {
  const keyTarget = createKeyTarget();
  const harness = createHarness({
    keyTarget,
    screenToMapThrows: new Error("adapter exploded"),
  });
  const { controller, machineHost } = harness;
  seedMachineImageSession(harness);
  controller.handlePointerEnter({ x: 600, y: 320 });

  const keydown = createKeyEvent({ code: "KeyP" });
  assert.doesNotThrow(() => keyTarget.dispatch("keydown", keydown));

  assert.equal(keydown.prevented, true);
  assert.equal(machineHost.getState().status.notice.kind, MACHINE_STATUS_NOTICE_KIND.RUNTIME_ERROR);
  assert.equal(machineHost.getState().status.notice.payload.error.source, RUNTIME_ERROR_SOURCE.INTERACTIONS);
  assert.equal(machineHost.getState().status.notice.payload.error.operation, "handle-toggle-pin");
  assert.equal(selectPanelStatusText(machineHost.getState()), "The overlay interaction failed. Try the action again.");
});

test("pin-toggle command on an existing pin removes it", () => {
  const harness = createHarness();
  const { controller } = harness;
  seedMachineImageSession(harness);

  controller.handleTogglePin({ screenPoint: { x: 600, y: 320 } });
  const handled = controller.handleTogglePin({ screenPoint: { x: 600, y: 320 } });

  assert.equal(handled, true);
  assert.equal(getSession(harness).registration.pins.length, 0);
});

test("machine fit event solves from interaction-created pins and clears the dirty flag", () => {
  const harness = createHarness();
  const { controller } = harness;
  seedMachineImageSession(harness);

  controller.handleTogglePin({ screenPoint: { x: 500, y: 300 } });
  controller.handleTogglePin({ screenPoint: { x: 700, y: 300 } });

  const result = dispatchMachineFitOverlayForSetup(harness);

  assert.ok(result.state.session.registration.solvedTransform);
  assert.equal(getSession(harness).registration.dirty, false);
  assert.ok(getSession(harness).registration.solvedTransform);
});

test("input runtime transitions are canonical machine transitions", () => {
  const machineHost = createMachineHost();

  machineHost.dispatch({
    type: MACHINE_EVENT_KIND.UPDATE_POINTER_RUNTIME,
    screenPx: { x: 500, y: 300 },
  });
  assert.deepEqual(machineHost.getState().runtime.pointer.screenPx, { x: 500, y: 300 });

  machineHost.dispatch({
    type: MACHINE_EVENT_KIND.BEGIN_POINTER_GESTURE,
    screenPx: { x: 510, y: 305 },
    gestureKind: DRAG_MODE.MAP_PAN,
  });
  assert.deepEqual(machineHost.getState().runtime.pointer.screenPx, { x: 510, y: 305 });
  assert.deepEqual(machineHost.getState().runtime.activeGesture, { kind: DRAG_MODE.MAP_PAN });

  machineHost.dispatch({
    type: MACHINE_EVENT_KIND.SET_INPUT_OVERRIDE,
    inputOverride: MACHINE_INPUT_OVERRIDE.PASS_THROUGH,
  });
  assert.equal(machineHost.getState().runtime.inputOverride, MACHINE_INPUT_OVERRIDE.PASS_THROUGH);

  machineHost.dispatch({
    type: MACHINE_EVENT_KIND.RESET_INPUT_RUNTIME,
    screenPx: null,
  });
  assert.deepEqual(machineHost.getState().runtime, createInitialMachineState().runtime);
});

test("adding a pin preserves the current rendered placement after a solved transform exists", () => {
  const harness = createHarness();
  const { controller, pageAdapter } = harness;
  seedMachineImageSession(harness);

  controller.handleTogglePin({ screenPoint: { x: 500, y: 300 } });
  controller.handleTogglePin({ screenPoint: { x: 700, y: 300 } });
  seedMachineSolvedRegistrationForAlignSetup(harness);

  const before = resolveOverlayScreenTransform({
    state: getSession(harness),
    snapshot: pageAdapter.getSnapshot(),
  });

  controller.handleTogglePin({ screenPoint: { x: 650, y: 340 } });

  const after = resolveOverlayScreenTransform({
    state: getSession(harness),
    snapshot: pageAdapter.getSnapshot(),
  });

  assert.deepEqual(after, before);
  assert.equal(getSession(harness).registration.dirty, true);
  assert.equal(getSession(harness).registration.pins.length, 3);
});

test("removing a pin preserves the current rendered placement after a solved transform exists", () => {
  const harness = createHarness();
  const { controller, pageAdapter } = harness;
  seedMachineImageSession(harness);

  controller.handleTogglePin({ screenPoint: { x: 500, y: 300 } });
  controller.handleTogglePin({ screenPoint: { x: 700, y: 300 } });
  seedMachineSolvedRegistrationForAlignSetup(harness);

  const before = resolveOverlayScreenTransform({
    state: getSession(harness),
    snapshot: pageAdapter.getSnapshot(),
  });

  controller.handleTogglePin({ screenPoint: { x: 500, y: 300 } });

  const after = resolveOverlayScreenTransform({
    state: getSession(harness),
    snapshot: pageAdapter.getSnapshot(),
  });

  assert.deepEqual(after, before);
  assert.equal(getSession(harness).registration.dirty, true);
  assert.equal(getSession(harness).registration.pins.length, 1);
});

test("clearing pins preserves the current rendered placement after a solved transform exists", () => {
  const harness = createHarness();
  const { controller, pageAdapter } = harness;
  seedMachineImageSession(harness);

  controller.handleTogglePin({ screenPoint: { x: 500, y: 300 } });
  controller.handleTogglePin({ screenPoint: { x: 700, y: 300 } });
  seedMachineSolvedRegistrationForAlignSetup(harness);

  const before = resolveOverlayScreenTransform({
    state: getSession(harness),
    snapshot: pageAdapter.getSnapshot(),
  });

  dispatchMachineClearPinsPreservingRenderedPlacement(harness);

  const after = resolveOverlayScreenTransform({
    state: getSession(harness),
    snapshot: pageAdapter.getSnapshot(),
  });

  assert.deepEqual(after, before);
  assert.deepEqual(getSession(harness).registration, {
    pins: [],
    solvedTransform: null,
    dirty: false,
  });
});

test("ctrl-wheel rotates the overlay only and marks a solved transform dirty again", () => {
  const harness = createHarness();
  const { controller, machineHost } = harness;
  seedMachineImageSession(harness);

  controller.handleTogglePin({ screenPoint: { x: 500, y: 300 } });
  controller.handleTogglePin({ screenPoint: { x: 700, y: 300 } });
  seedMachineSolvedRegistrationForAlignSetup(harness);
  assert.equal(getSession(harness).registration.dirty, false);

  controller.handleWheel({
    deltaY: -100,
    wheelMode: WHEEL_MODE.ROTATE_OVERLAY,
    screenPoint: { x: 600, y: 320 },
  });

  const rotatedPlacement = getSession(harness).placement;
  assert.equal(getSession(harness).registration.dirty, true);
  assert.ok(getSession(harness).registration.solvedTransform);

  assert.equal(
    consumeHistory(machineHost, MACHINE_EVENT_KIND.UNDO).kind,
    MACHINE_HISTORY_KIND.ROTATE_OVERLAY,
  );
  assert.equal(getSession(harness).placement.rotationRad, 0);
  assert.equal(getSession(harness).registration.dirty, false);

  assert.equal(
    consumeHistory(machineHost, MACHINE_EVENT_KIND.REDO).kind,
    MACHINE_HISTORY_KIND.ROTATE_OVERLAY,
  );
  assert.deepEqual(getSession(harness).placement, rotatedPlacement);
  assert.equal(getSession(harness).registration.dirty, true);
});

test("ctrl-wheel rotates around the image point under the mouse", () => {
  const harness = createHarness();
  const { controller, pageAdapter } = harness;
  seedMachineImageSession(harness);

  const anchorScreenPoint = { x: 650, y: 260 };
  const beforeTransform = resolveOverlayScreenTransform({
    state: getSession(harness),
    snapshot: pageAdapter.getSnapshot(),
  });
  const anchorImagePoint = screenPointToImagePoint({
    screenPoint: anchorScreenPoint,
    transform: beforeTransform,
  });

  controller.handleWheel({
    deltaY: -100,
    wheelMode: WHEEL_MODE.ROTATE_OVERLAY,
    screenPoint: anchorScreenPoint,
  });

  const afterTransform = resolveOverlayScreenTransform({
    state: getSession(harness),
    snapshot: pageAdapter.getSnapshot(),
  });
  const afterAnchorScreenPoint = imagePointToScreenPoint({
    imagePoint: anchorImagePoint,
    transform: afterTransform,
  });

  assert.ok(Math.abs(afterAnchorScreenPoint.x - anchorScreenPoint.x) < 1e-9);
  assert.ok(Math.abs(afterAnchorScreenPoint.y - anchorScreenPoint.y) < 1e-9);
});

test("plain wheel zooms the map only and leaves overlay placement unchanged", () => {
  const harness = createHarness();
  const { controller, adapterCalls } = harness;
  seedMachineImageSession(harness);

  const initialPlacement = getSession(harness).placement;
  controller.handleWheel({
    deltaY: -100,
    wheelMode: WHEEL_MODE.MAP_ZOOM,
    screenPoint: { x: 600, y: 320 },
  });

  assert.deepEqual(getSession(harness).placement, initialPlacement);
  assert.equal(adapterCalls.mapZoomCalls.length, 1);
  assert.deepEqual(adapterCalls.mapZoomCalls[0].screenPoint, { x: 600, y: 320 });
  assert.equal(adapterCalls.mapZoomCalls[0].deltaY, -100);
});

test("shift-wheel scales around the image point under the mouse", () => {
  const harness = createHarness();
  const { controller, pageAdapter, machineHost } = harness;
  seedMachineImageSession(harness);

  const anchorScreenPoint = { x: 650, y: 260 };
  const initialPlacement = getSession(harness).placement;
  const beforeTransform = resolveOverlayScreenTransform({
    state: getSession(harness),
    snapshot: pageAdapter.getSnapshot(),
  });
  const anchorImagePoint = screenPointToImagePoint({
    screenPoint: anchorScreenPoint,
    transform: beforeTransform,
  });

  controller.handleWheel({
    deltaY: -100,
    wheelMode: WHEEL_MODE.ZOOM_OVERLAY,
    screenPoint: anchorScreenPoint,
  });

  const afterTransform = resolveOverlayScreenTransform({
    state: getSession(harness),
    snapshot: pageAdapter.getSnapshot(),
  });
  const afterAnchorScreenPoint = imagePointToScreenPoint({
    imagePoint: anchorImagePoint,
    transform: afterTransform,
  });

  assert.ok(Math.abs(afterAnchorScreenPoint.x - anchorScreenPoint.x) < 1e-9);
  assert.ok(Math.abs(afterAnchorScreenPoint.y - anchorScreenPoint.y) < 1e-9);

  const scaledPlacement = getSession(harness).placement;
  assert.equal(
    consumeHistory(machineHost, MACHINE_EVENT_KIND.UNDO).kind,
    MACHINE_HISTORY_KIND.SCALE_OVERLAY,
  );
  assert.deepEqual(getSession(harness).placement, initialPlacement);

  assert.equal(
    consumeHistory(machineHost, MACHINE_EVENT_KIND.REDO).kind,
    MACHINE_HISTORY_KIND.SCALE_OVERLAY,
  );
  assert.deepEqual(getSession(harness).placement, scaledPlacement);
});

test("map pan/zoom gestures keep a solved transform clean until overlay-only editing begins", () => {
  const harness = createHarness();
  const { controller, adapterCalls } = harness;
  seedMachineImageSession(harness);

  controller.handleTogglePin({ screenPoint: { x: 500, y: 300 } });
  controller.handleTogglePin({ screenPoint: { x: 700, y: 300 } });
  seedMachineSolvedRegistrationForAlignSetup(harness);

  const solvedPlacement = getSession(harness).placement;
  assert.equal(getSession(harness).registration.dirty, false);

  controller.handlePointerDown({
    button: 0,
    screenPoint: { x: 500, y: 300 },
    dragMode: DRAG_MODE.MAP_PAN,
  });
  controller.handlePointerMove({ x: 520, y: 310 });
  controller.handlePointerUp({ x: 520, y: 310 });
  controller.handleWheel({
    deltaY: -100,
    wheelMode: WHEEL_MODE.MAP_ZOOM,
    screenPoint: { x: 600, y: 320 },
  });

  assert.deepEqual(getSession(harness).placement, solvedPlacement);
  assert.equal(getSession(harness).registration.dirty, false);
  assert.equal(adapterCalls.mapPan.starts.length, 1);
  assert.equal(adapterCalls.mapZoomCalls.length, 1);

  controller.handleWheel({
    deltaY: -100,
    wheelMode: WHEEL_MODE.ROTATE_OVERLAY,
    screenPoint: { x: 600, y: 320 },
  });

  assert.equal(getSession(harness).registration.dirty, true);
});

test("ctrl-wheel rotates the overlay without zooming the map", () => {
  const harness = createHarness();
  const { controller, adapterCalls } = harness;
  seedMachineImageSession(harness);

  controller.handleWheel({
    deltaY: 100,
    wheelMode: WHEEL_MODE.ROTATE_OVERLAY,
    screenPoint: { x: 600, y: 320 },
  });

  assert.notEqual(getSession(harness).placement.rotationRad, 0);
  assert.equal(adapterCalls.mapZoomCalls.length, 0);
});

test("alt-wheel adjusts the overlay opacity in align mode without zooming the map", () => {
  const harness = createHarness();
  const { controller, adapterCalls } = harness;
  seedMachineImageSession(harness);

  const initialOpacity = getSession(harness).opacity;
  controller.handleWheel({
    deltaY: -100,
    wheelMode: WHEEL_MODE.ADJUST_OPACITY,
    screenPoint: { x: 600, y: 320 },
  });

  const adjustedOpacity = getSession(harness).opacity;
  assert.ok(getSession(harness).opacity > initialOpacity);
  assert.equal(adapterCalls.mapZoomCalls.length, 0);
  assert.equal(adjustedOpacity, getSession(harness).opacity);
});

test("alt-wheel adjusts the overlay opacity in trace mode", () => {
  const harness = createHarness();
  const { controller, adapterCalls, machineHost } = harness;
  seedMachineImageSession(harness);
  machineHost.dispatch({
    type: MACHINE_EVENT_KIND.SELECT_MODE,
    mode: SESSION_MODE.TRACE,
  });

  const initialOpacity = getSession(harness).opacity;
  const handled = controller.handleWheel({
    deltaY: 100,
    wheelMode: WHEEL_MODE.ADJUST_OPACITY,
    screenPoint: { x: 600, y: 320 },
  });

  const adjustedOpacity = getSession(harness).opacity;
  assert.equal(handled, true);
  assert.ok(getSession(harness).opacity < initialOpacity);
  assert.equal(adapterCalls.mapZoomCalls.length, 0);
  assert.equal(adjustedOpacity, getSession(harness).opacity);
});

test("opacity changes do not create undo steps and survive placement undo", () => {
  const harness = createHarness();
  const { controller, machineHost } = harness;
  seedMachineImageSession(harness);

  const initialOpacity = getSession(harness).opacity;
  controller.handleWheel({
    deltaY: -100,
    wheelMode: WHEEL_MODE.ADJUST_OPACITY,
    screenPoint: { x: 600, y: 320 },
  });
  const adjustedOpacity = getSession(harness).opacity;

  controller.handlePointerDown({
    button: 0,
    screenPoint: { x: 500, y: 300 },
    dragMode: DRAG_MODE.MOVE_OVERLAY,
  });
  controller.handlePointerMove({ x: 560, y: 280 });
  controller.handlePointerUp({ x: 560, y: 280 });

  assert.ok(adjustedOpacity > initialOpacity);
  assert.equal(
    consumeHistory(machineHost, MACHINE_EVENT_KIND.UNDO).kind,
    MACHINE_HISTORY_KIND.MOVE_OVERLAY,
  );
  assert.equal(getSession(harness).opacity, adjustedOpacity);
});

test("toggling to trace auto-computes a dirty transform when enough pins exist", () => {
  const harness = createHarness();
  const { controller, machineHost } = harness;
  seedMachineImageSession(harness);

  controller.handleTogglePin({ screenPoint: { x: 500, y: 300 } });
  controller.handleTogglePin({ screenPoint: { x: 700, y: 300 } });
  assert.equal(getSession(harness).registration.dirty, true);

  machineHost.dispatch({
    type: MACHINE_EVENT_KIND.SELECT_MODE,
    mode: SESSION_MODE.TRACE,
  });

  assert.equal(getSession(harness).mode, SESSION_MODE.TRACE);
  assert.equal(getSession(harness).registration.dirty, false);
  assert.ok(getSession(harness).registration.solvedTransform);
});

test("clearing pins with no image is a machine no-op", () => {
  const harness = createHarness();
  const { machineHost } = harness;
  const beforeState = machineHost.getState();

  const result = machineHost.dispatch({ type: MACHINE_EVENT_KIND.CLEAR_PINS });

  assert.equal(result.state, beforeState);
  assert.equal(result.historyRecord, null);
});

test("switching mode clears pass-through and ends any active map pan through one transition path", () => {
  const keyTarget = createKeyTarget();
  const harness = createHarness({ keyTarget });
  const { controller, adapterCalls, machineHost } = harness;
  seedMachineImageSession(harness);

  controller.handlePointerDown({
    button: 0,
    screenPoint: { x: 500, y: 300 },
    dragMode: DRAG_MODE.MAP_PAN,
  });
  controller.handlePointerMove({ x: 520, y: 310 });
  controller.handlePointerEnter({ x: 520, y: 310 });
  keyTarget.dispatch("keydown", createKeyEvent({ code: "Space" }));

  machineHost.dispatch({
    type: MACHINE_EVENT_KIND.SELECT_MODE,
    mode: SESSION_MODE.TRACE,
  });

  assert.equal(controller.getRuntimeState().activeGesture, null);
  assert.equal(controller.getRuntimeState().inputOverride, null);
  assert.deepEqual(adapterCalls.mapPan.ends, [{ x: 520, y: 310 }]);
});

test("clearing the image resets runtime and ends any active map pan through one transition path", () => {
  // The machine owns runtime cleanup; the interaction adapter only releases
  // page-adapter resources tied to the ended gesture.
  const harness = createHarness();
  const { controller, adapterCalls, machineHost } = harness;
  seedMachineImageSession(harness);

  controller.handlePointerDown({
    button: 0,
    screenPoint: { x: 500, y: 300 },
    dragMode: DRAG_MODE.MAP_PAN,
  });
  controller.handlePointerMove({ x: 520, y: 310 });
  machineHost.dispatch({ type: MACHINE_EVENT_KIND.CLEAR_IMAGE });

  assert.equal(getSession(harness).image, null);
  assert.equal(controller.getRuntimeState().activeGesture, null);
  assert.equal(controller.getRuntimeState().inputOverride, null);
  assert.equal(controller.getRuntimeState().pointer.screenPx, null);
  assert.deepEqual(adapterCalls.mapPan.ends, [{ x: 520, y: 310 }]);
});

test("space activates temporary pass-through while aligning", () => {
  const keyTarget = createKeyTarget();
  const harness = createHarness({ keyTarget });
  const { controller } = harness;
  seedMachineImageSession(harness);

  const keydown = createKeyEvent({ code: "Space" });
  keyTarget.dispatch("keydown", keydown);
  assert.equal(controller.getRuntimeState().inputOverride, MACHINE_INPUT_OVERRIDE.PASS_THROUGH);
  assert.equal(keydown.prevented, true);
  assert.equal(keydown.stopped, true);
  assert.equal(keydown.immediatelyStopped, true);
  keyTarget.dispatch("keyup", { code: "Space" });
  assert.equal(controller.getRuntimeState().inputOverride, null);
});

test("pressing P toggles a pin at the current pointer location", () => {
  // Keyboard delivery is adapter plumbing; the pin mutation itself is still a
  // canonical machine transition.
  const keyTarget = createKeyTarget();
  const harness = createHarness({ keyTarget });
  const { controller } = harness;
  seedMachineImageSession(harness);

  controller.handlePointerEnter({ x: 600, y: 320 });
  const keydown = createKeyEvent({ code: "KeyP" });
  keyTarget.dispatch("keydown", keydown);

  assert.equal(getSession(harness).registration.pins.length, 1);
  assert.equal(keydown.prevented, true);
  assert.equal(keydown.stopped, true);
  assert.equal(keydown.immediatelyStopped, true);
});

test("pressing P still toggles when focus is on an extension button", () => {
  const keyTarget = createKeyTarget();
  const harness = createHarness({ keyTarget });
  const { controller } = harness;
  seedMachineImageSession(harness);

  controller.handlePointerEnter({ x: 600, y: 320 });
  const keydown = createKeyEvent({
    code: "KeyP",
    composedPath() {
      return [
        {
          tagName: "BUTTON",
          type: "button",
        },
      ];
    },
  });
  keyTarget.dispatch("keydown", keydown);

  assert.equal(getSession(harness).registration.pins.length, 1);
  assert.equal(keydown.prevented, true);
});

test("keyboard shortcuts can be delivered through the early keyboard gateway", () => {
  const keyboardGateway = createKeyboardGatewayHarness();
  const harness = createHarness({ keyboardGateway });
  const { controller } = harness;
  seedMachineImageSession(harness);

  controller.handlePointerEnter({ x: 600, y: 320 });
  const keydown = createKeyEvent({ code: "KeyP" });
  keyboardGateway.dispatch("keydown", keydown);

  assert.equal(getSession(harness).registration.pins.length, 1);
});

test("keyboard shortcut resolution is single-source and mode-aware", () => {
  const state = createEmptySession({
    mode: SESSION_MODE.ALIGN,
    image: TEST_IMAGE,
  });

  assert.equal(
    resolveInputProjection({
      event: createKeyEvent({ code: "KeyP" }),
      state,
    }).keyboard.action,
    KEYBOARD_SHORTCUT_ACTION.TOGGLE_PIN_CURRENT_POINTER,
  );
  assert.equal(
    resolveInputProjection({
      event: createKeyEvent({ code: "Escape" }),
      state,
    }).keyboard.action,
    KEYBOARD_SHORTCUT_ACTION.SWITCH_TO_TRACE,
  );
  assert.equal(
    resolveInputProjection({
      event: createKeyEvent({ code: "Space" }),
      state,
    }).keyboard.action,
    KEYBOARD_SHORTCUT_ACTION.ENABLE_PASS_THROUGH,
  );
  assert.equal(
    resolveInputProjection({
      event: createKeyEvent({ code: "KeyP" }),
      state: { ...state, mode: SESSION_MODE.TRACE },
    }).keyboard.action,
    null,
  );
});

test("drag mode resolution keeps map pan as the unmodified default", () => {
  assert.equal(isKnownDragMode(DRAG_MODE.MAP_PAN), true);
  assert.equal(isKnownDragMode("not-a-drag-mode"), false);
  assert.equal(
    resolveDragMode({ shiftKey: false }),
    DRAG_MODE.MAP_PAN,
  );
  assert.equal(
    resolveDragMode({ shiftKey: true }),
    DRAG_MODE.MOVE_OVERLAY,
  );
});

test("wheel mode resolution is single-source and modifier-aware", () => {
  assert.equal(isKnownWheelMode(WHEEL_MODE.MAP_ZOOM), true);
  assert.equal(isKnownWheelMode("not-a-wheel-mode"), false);
  assert.equal(
    resolveWheelMode({ shiftKey: false, altKey: false, ctrlKey: false }),
    WHEEL_MODE.MAP_ZOOM,
  );
  assert.equal(
    resolveWheelMode({ shiftKey: true, altKey: false, ctrlKey: false }),
    WHEEL_MODE.ZOOM_OVERLAY,
  );
  assert.equal(
    resolveWheelMode({ shiftKey: false, altKey: true, ctrlKey: false }),
    WHEEL_MODE.ADJUST_OPACITY,
  );
  assert.equal(
    resolveWheelMode({ shiftKey: false, altKey: false, ctrlKey: true }),
    WHEEL_MODE.ROTATE_OVERLAY,
  );
  assert.equal(
    resolveWheelMode({ shiftKey: true, altKey: true, ctrlKey: true }),
    WHEEL_MODE.ADJUST_OPACITY,
  );
});

test("align capability helpers are the single source of truth for editability", () => {
  const alignSession = createProjectionSession({ mode: SESSION_MODE.ALIGN });
  const traceSession = createProjectionSession({ mode: SESSION_MODE.TRACE });
  const emptyAlignSession = createProjectionSession({
    mode: SESSION_MODE.ALIGN,
    image: null,
  });

  assert.equal(
    resolveInputProjection({ state: alignSession })
      .overlayPolicy.canEditOverlay,
    true,
  );
  assert.equal(
    resolveInputProjection({ state: traceSession })
      .overlayPolicy.canEditOverlay,
    false,
  );
  assert.equal(
    resolveInputProjection({ state: emptyAlignSession })
      .overlayPolicy.canEditOverlay,
    false,
  );
  assert.equal(
    resolveInputProjection({
      state: alignSession,
      runtime: createInputRuntime(),
    }).overlayPolicy.ownsPointerHitTesting,
    true,
  );
  assert.equal(
    resolveInputProjection({
      state: alignSession,
      runtime: createInputRuntime({ passThrough: true }),
    }).overlayPolicy.ownsPointerHitTesting,
    false,
  );
  assert.equal(
    resolveInputProjection({
      state: traceSession,
      runtime: createInputRuntime(),
    }).overlayPolicy.ownsPointerHitTesting,
    false,
  );
});

test("gesture ownership helpers are the single source of truth for map-vs-overlay ownership", () => {
  assert.equal(isMapPanDragMode(DRAG_MODE.MAP_PAN), true);
  assert.equal(isMapPanDragMode(DRAG_MODE.MOVE_OVERLAY), false);
});

test("wheel capability is single-source across modes and modifiers", () => {
  const alignSession = createProjectionSession({ mode: SESSION_MODE.ALIGN });
  const traceSession = createProjectionSession({ mode: SESSION_MODE.TRACE });

  assert.equal(
    resolveInputProjection({
      state: alignSession,
      runtime: createInputRuntime(),
      isPointerOverOverlay: true,
      wheelMode: WHEEL_MODE.MAP_ZOOM,
    }).wheel.shouldHandle,
    true,
  );
  assert.equal(
    resolveInputProjection({
      state: traceSession,
      runtime: createInputRuntime(),
      isPointerOverOverlay: true,
      wheelMode: WHEEL_MODE.MAP_ZOOM,
    }).wheel.shouldHandle,
    false,
  );
  assert.equal(
    resolveInputProjection({
      state: traceSession,
      runtime: createInputRuntime(),
      isPointerOverOverlay: true,
      wheelMode: WHEEL_MODE.ADJUST_OPACITY,
    }).wheel.shouldHandle,
    true,
  );
});

test("overlay wheel policy is single-source", () => {
  const state = createProjectionSession({
    mode: SESSION_MODE.ALIGN,
    opacity: 0.6,
  });
  const runtime = createInputRuntime();

  assert.deepEqual(
    resolveInputProjection({
      state,
      runtime,
      isPointerOverOverlay: true,
      shiftKey: false,
      altKey: false,
      ctrlKey: false,
    }).wheel,
    {
      wheelMode: WHEEL_MODE.MAP_ZOOM,
      shouldHandle: true,
      shouldIntercept: false,
      shouldConsume: true,
    },
  );

  assert.deepEqual(
    resolveInputProjection({
      state,
      runtime,
      isPointerOverOverlay: true,
      shiftKey: false,
      altKey: true,
      ctrlKey: false,
    }).wheel,
    {
      wheelMode: WHEEL_MODE.ADJUST_OPACITY,
      shouldHandle: true,
      shouldIntercept: true,
      shouldConsume: true,
    },
  );
});

test("overlay pointer move policy is single-source", () => {
  const state = createProjectionSession({ mode: SESSION_MODE.ALIGN });
  const runtime = createInputRuntime();

  assert.deepEqual(
    resolveInputProjection({
      state,
      runtime,
      isPointerOverOverlay: false,
    }).pointerMove,
    {
      shouldTrackPointer: false,
    },
  );

  assert.deepEqual(
    resolveInputProjection({
      state,
      runtime,
      isPointerOverOverlay: true,
    }).pointerMove,
    {
      shouldTrackPointer: true,
    },
  );

  assert.deepEqual(
    resolveInputProjection({
      state,
      runtime,
      isPointerOverOverlay: true,
      buttons: 1,
    }).pointerMove,
    {
      shouldTrackPointer: false,
    },
  );
});

test("overlay pointer sequence policy is single-source", () => {
  const state = createProjectionSession({ mode: SESSION_MODE.ALIGN });
  const runtime = createInputRuntime();

  assert.deepEqual(
    resolveInputProjection({
      state,
      runtime,
      isPointerOverOverlay: false,
      button: 0,
      shiftKey: false,
    }).pointerSequence,
    {
      shouldOwnPointerSequence: false,
      dragMode: null,
    },
  );

  assert.deepEqual(
    resolveInputProjection({
      state,
      runtime,
      isPointerOverOverlay: true,
      button: 0,
      shiftKey: false,
    }).pointerSequence,
    {
      shouldOwnPointerSequence: true,
      dragMode: DRAG_MODE.MAP_PAN,
    },
  );

  assert.deepEqual(
    resolveInputProjection({
      state,
      runtime,
      isPointerOverOverlay: true,
      button: 0,
      shiftKey: true,
    }).pointerSequence,
    {
      shouldOwnPointerSequence: true,
      dragMode: DRAG_MODE.MOVE_OVERLAY,
    },
  );

  assert.deepEqual(
    resolveInputProjection({
      state,
      runtime,
      isPointerOverOverlay: true,
      button: 1,
      shiftKey: true,
    }).pointerSequence,
    {
      shouldOwnPointerSequence: false,
      dragMode: null,
    },
  );
});

test("overlay activation policy is single-source", () => {
  const state = createProjectionSession({ mode: SESSION_MODE.ALIGN });
  const traceState = createProjectionSession({ mode: SESSION_MODE.TRACE });
  const runtime = createInputRuntime();

  assert.deepEqual(
    resolveInputProjection({
      state,
      runtime,
      isPointerOverOverlay: false,
    }).activation,
    {
      shouldConsumeClick: false,
      shouldTogglePin: false,
    },
  );

  assert.deepEqual(
    resolveInputProjection({
      state,
      runtime,
      isPointerOverOverlay: true,
    }).activation,
    {
      shouldConsumeClick: true,
      shouldTogglePin: true,
    },
  );

  assert.deepEqual(
    resolveInputProjection({
      state: traceState,
      runtime,
      isPointerOverOverlay: true,
    }).activation,
    {
      shouldConsumeClick: false,
      shouldTogglePin: false,
    },
  );

  assert.equal(
    resolveInputProjection({
      state,
      runtime,
      isPointerOverOverlay: true,
    }).activation.shouldTogglePin,
    true,
  );
});

test("map pan does nothing when the page adapter cannot start it", () => {
  const harness = createHarness({
    beginMapPanReturns: false,
  });
  const { controller, adapterCalls } = harness;
  seedMachineImageSession(harness);

  const initialPlacement = getSession(harness).placement;
  const handled = controller.handlePointerDown({
    button: 0,
    screenPoint: { x: 500, y: 300 },
    dragMode: DRAG_MODE.MAP_PAN,
  });

  assert.equal(handled, false);
  assert.deepEqual(getSession(harness).placement, initialPlacement);
  assert.equal(controller.getRuntimeState().activeGesture, null);
  assert.deepEqual(adapterCalls.mapPan.starts, [{ x: 500, y: 300 }]);
});

test("map zoom does nothing when the page adapter cannot forward it", () => {
  const harness = createHarness({
    forwardMapZoomReturns: false,
  });
  const { controller, adapterCalls } = harness;
  seedMachineImageSession(harness);

  const initialPlacement = getSession(harness).placement;
  const handled = controller.handleWheel({
    deltaY: -100,
    wheelMode: WHEEL_MODE.MAP_ZOOM,
    screenPoint: { x: 600, y: 320 },
  });

  assert.equal(handled, false);
  assert.deepEqual(getSession(harness).placement, initialPlacement);
  assert.equal(adapterCalls.mapZoomCalls.length, 1);
});

test("pass-through release stays active until the runtime says it can be released", () => {
  assert.equal(
    resolveInputProjection({
      event: createKeyEvent({ code: "Space" }),
      state: createProjectionSession({
        mode: SESSION_MODE.ALIGN,
        image: null,
      }),
      runtime: createInputRuntime(),
    }).passThroughRelease.shouldRelease,
    true,
  );
  assert.equal(
    resolveInputProjection({
      event: createKeyEvent({ code: "Space" }),
      state: createProjectionSession({
        mode: SESSION_MODE.TRACE,
        image: null,
      }),
      runtime: createInputRuntime({ passThrough: true }),
    }).passThroughRelease.shouldRelease,
    true,
  );
  assert.equal(
    resolveInputProjection({
      event: createKeyEvent({ code: "KeyP" }),
      state: createProjectionSession({
        mode: SESSION_MODE.ALIGN,
        image: null,
      }),
      runtime: createInputRuntime({ passThrough: true }),
    }).passThroughRelease.shouldRelease,
    false,
  );
});

function createHarness({
  keyTarget = createKeyTarget(),
  keyboardGateway = null,
  beginMapPanReturns = true,
  forwardMapZoomReturns = true,
  screenToMapThrows = null,
  snapshot = null,
} = {}) {
  const adapterCalls = {
    mapPan: {
      starts: [],
      moves: [],
      ends: [],
    },
    mapZoomCalls: [],
  };
  const pageAdapter = createPageAdapter({
    adapterCalls,
    beginMapPanReturns,
    forwardMapZoomReturns,
    screenToMapThrows,
    snapshot,
  });
  const machineHost = createMachineHost();
  const interactions = createInteractionController({
    machineHost,
    keyTarget,
    keyboardGateway,
    pageAdapter,
  });
  return {
    controller: interactions,
    machineHost,
    keyTarget,
    adapterCalls,
    pageAdapter,
  };
}

function getSession({ machineHost }) {
  return machineHost.getState().session;
}

function createInputRuntime({ passThrough = false } = {}) {
  return {
    ...createInitialMachineState().runtime,
    inputOverride: passThrough ? MACHINE_INPUT_OVERRIDE.PASS_THROUGH : null,
  };
}

function createProjectionSession({
  mode = SESSION_MODE.ALIGN,
  image = TEST_IMAGE,
  opacity = 0.6,
} = {}) {
  return createEmptySession({
    mode,
    image,
    opacity,
  });
}

function seedMachineImageSession({ machineHost, pageAdapter }, image = TEST_IMAGE) {
  const snapshot = pageAdapter.getSnapshot();
  machineHost.dispatch({
    type: MACHINE_EVENT_KIND.LOAD_IMAGE,
    image,
    placement: createPlacementTransform({
      image,
      centerMapLatLon: snapshot.mapView.center,
      scale: 1,
      rotationRad: 0,
      zoom: snapshot.mapView.zoom,
    }),
  });
}

function dispatchMachineFitOverlayForSetup({ machineHost }) {
  return machineHost.dispatch({ type: MACHINE_EVENT_KIND.FIT_OVERLAY });
}

function seedMachineSolvedRegistrationForAlignSetup(harness) {
  const result = dispatchMachineFitOverlayForSetup(harness);
  if (result.state.session.registration.solvedTransform) {
    harness.machineHost.dispatch({
      type: MACHINE_EVENT_KIND.SELECT_MODE,
      mode: SESSION_MODE.ALIGN,
    });
  }
  return result;
}

function dispatchMachineClearPinsPreservingRenderedPlacement({ machineHost, pageAdapter }) {
  return machineHost.dispatch({
    type: MACHINE_EVENT_KIND.CLEAR_PINS,
    preservedPlacement: derivePreservedPlacement({
      state: machineHost.getState().session,
      pageAdapter,
    }),
  });
}

function derivePreservedPlacement({ state, pageAdapter }) {
  if (!state.image || !state.registration.solvedTransform || state.registration.dirty) {
    return null;
  }
  const snapshot = pageAdapter.getSnapshot();
  return derivePlacementFromScreenTransform({
    snapshot,
    transform: resolveOverlayScreenTransform({ state, snapshot }),
  });
}

function consumeHistory(machineHost, eventType) {
  return machineHost.dispatch({ type: eventType }).consumedHistoryRecord;
}

function createPageAdapter({
  adapterCalls,
  beginMapPanReturns,
  forwardMapZoomReturns,
  screenToMapThrows,
  snapshot = null,
}) {
  const resolvedSnapshot = snapshot ?? {
    viewportRect: { left: 100, top: 100, width: 800, height: 400 },
    mapView: { center: { lat: -1.23, lon: 36.84 }, zoom: 16 },
  };
  return {
    getSnapshot() {
      return resolvedSnapshot;
    },
    mapToScreen(point) {
      return {
        x: 500 + (point.lon - 36.84) * 100,
        y: 300 + (point.lat + 1.23) * 100,
      };
    },
    screenToMap(point) {
      if (screenToMapThrows) {
        throw screenToMapThrows;
      }
      return {
        lat: -1.23 + (point.y - 300) / 100,
        lon: 36.84 + (point.x - 500) / 100,
      };
    },
    beginMapPan(screenPoint) {
      adapterCalls.mapPan.starts.push(screenPoint);
      return beginMapPanReturns;
    },
    updateMapPan(screenPoint) {
      adapterCalls.mapPan.moves.push({ screenPoint });
    },
    endMapPan(screenPoint) {
      adapterCalls.mapPan.ends.push(screenPoint);
    },
    forwardMapZoom(payload) {
      adapterCalls.mapZoomCalls.push(payload);
      return forwardMapZoomReturns;
    },
  };
}

function createKeyboardGatewayHarness() {
  let subscriber = null;
  return {
    subscribe(nextSubscriber) {
      subscriber = nextSubscriber;
      return () => {
        if (subscriber === nextSubscriber) {
          subscriber = null;
        }
      };
    },
    dispatch(type, event) {
      subscriber?.[type]?.(event);
    },
  };
}

function createKeyTarget() {
  const listeners = new Map();

  return {
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    removeEventListener(type, listener) {
      if (listeners.get(type) === listener) {
        listeners.delete(type);
      }
    },
    dispatch(type, event) {
      if (!event.composedPath) {
        event.composedPath = () => [];
      }
      listeners.get(type)?.(event);
    },
  };
}

function createKeyEvent(overrides = {}) {
  return {
    code: "",
    defaultPrevented: false,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    prevented: false,
    stopped: false,
    immediatelyStopped: false,
    preventDefault() {
      this.defaultPrevented = true;
      this.prevented = true;
    },
    stopPropagation() {
      this.stopped = true;
    },
    stopImmediatePropagation() {
      this.immediatelyStopped = true;
    },
    composedPath() {
      return [];
    },
    ...overrides,
  };
}
