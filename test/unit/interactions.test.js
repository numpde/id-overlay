import test from "node:test";
import assert from "node:assert/strict";

import { createInteractionController } from "../../src/core/interactions.js";
import {
  INTERACTION_RUNTIME_ACTION,
  reduceInteractionRuntime,
} from "../../src/core/interaction-runtime.js";
import {
  doesDragEditPlacement,
  doesWheelEditOpacity,
  doesWheelEditPlacement,
  DRAG_MODE,
  INTERACTION_EVENT,
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
  nextSessionMode,
} from "../../src/core/session.js";
import {
  MACHINE_EVENT_KIND,
  MACHINE_FEEDBACK_KIND,
  MACHINE_HISTORY_KIND,
  createMachineHost,
} from "../../src/core/machine/index.js";
import {
  createPlacementScreenTransform,
  createPlacementTransform,
  derivePlacementFromScreenTransform,
  imagePointToRenderedScreenPoint,
  imagePointToScreenPoint,
  resolveOverlayScreenTransform,
  screenPointToImagePoint,
} from "../../src/core/transform.js";

test("nextSessionMode toggles between align and trace", () => {
  assert.equal(nextSessionMode(SESSION_MODE.TRACE), SESSION_MODE.ALIGN);
  assert.equal(nextSessionMode(SESSION_MODE.ALIGN), SESSION_MODE.TRACE);
});

test("loading an image seeds align mode and the current map center placement", () => {
  const { controller, store, machineHost } = createHarness();

  controller.loadImage({
    src: "data:image/png;base64,abc",
    width: 800,
    height: 400,
  });

  const state = store.getState();
  assert.equal(state.mode, "align");
  const transform = createPlacementScreenTransform({
    snapshot: {
      viewportRect: { left: 100, top: 100, width: 800, height: 400 },
      mapView: { center: { lat: -1.23, lon: 36.84 }, zoom: 16 },
    },
    placement: state.placement,
  });
  assert.deepEqual(imagePointToScreenPoint({
    imagePoint: { x: 400, y: 200 },
    transform,
  }), { x: 500, y: 300 });
  assert.equal(state.registration.pins.length, 0);
});

test("shift-dragging updates placement through the adapter only", () => {
  const { controller, store, machineHost } = createHarness();
  controller.loadImage({
    src: "data:image/png;base64,abc",
    width: 800,
    height: 400,
  });

  controller.handlePointerDown({
    button: 0,
    screenPoint: { x: 500, y: 300 },
    shiftKey: true,
  });
  controller.handlePointerMove({ x: 560, y: 280 });
  controller.handlePointerUp({ x: 560, y: 280 });

  const nextTransform = createPlacementScreenTransform({
    snapshot: {
      viewportRect: { left: 100, top: 100, width: 800, height: 400 },
      mapView: { center: { lat: -1.23, lon: 36.84 }, zoom: 16 },
    },
    placement: store.getState().placement,
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
    placement: store.getState().placement,
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
    placement: store.getState().placement,
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
  const { controller, store, pageAdapter } = createHarness({
    snapshot: surfaceMotionSnapshot,
  });
  controller.loadImage({
    src: "data:image/png;base64,abc",
    width: 800,
    height: 400,
  });

  const beforeTransform = resolveOverlayScreenTransform({
    state: store.getState(),
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
    shiftKey: true,
  });
  controller.handlePointerMove(endScreenPoint);
  controller.handlePointerUp(endScreenPoint);

  const afterTransform = resolveOverlayScreenTransform({
    state: store.getState(),
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
  const { controller, store, adapterCalls } = createHarness();
  controller.loadImage({
    src: "data:image/png;base64,abc",
    width: 800,
    height: 400,
  });
  const initialPlacement = store.getState().placement;

  controller.handlePointerDown({
    button: 0,
    screenPoint: { x: 500, y: 300 },
    shiftKey: false,
  });
  controller.handlePointerMove({ x: 520, y: 310 });
  controller.handlePointerUp({ x: 520, y: 310 });

  assert.deepEqual(store.getState().placement, initialPlacement);
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

test("double-click adds a pin at the correct image and map coordinates", () => {
  const { controller, store } = createHarness();
  controller.loadImage({
    src: "data:image/png;base64,abc",
    width: 800,
    height: 400,
  });

  const result = controller.handleDoubleClick({ x: 600, y: 320 });
  assert.equal(result.ok, true);
  assert.equal(result.action, "added");
  assert.equal(store.getState().registration.pins.length, 1);
  assert.deepEqual(store.getState().registration.pins[0], {
    id: 1,
    imagePx: { x: 500, y: 220 },
    mapLatLon: { lat: -1.03, lon: 37.84 },
  });
});

test("interaction boundaries emit a runtime error event instead of throwing raw adapter failures", () => {
  const { controller, machineHost } = createHarness({
    screenToMapThrows: new Error("adapter exploded"),
  });
  const events = [];
  controller.subscribeEvents((event) => {
    events.push(event);
  });
  controller.loadImage({
    src: "data:image/png;base64,abc",
    width: 800,
    height: 400,
  });
  const feedback = [];
  machineHost.subscribeResults(({ result }) => {
    if (result.feedback.kind === MACHINE_FEEDBACK_KIND.RUNTIME_ERROR) {
      feedback.push(result.feedback);
    }
  });

  const result = controller.handleDoubleClick({ x: 600, y: 320 });

  assert.equal(result.ok, false);
  assert.equal(events.length, 1);
  assert.equal(events[0].type, INTERACTION_EVENT.RUNTIME_ERROR);
  assert.equal(events[0].error.source, RUNTIME_ERROR_SOURCE.INTERACTIONS);
  assert.equal(events[0].error.operation, "handle-double-click");
  assert.deepEqual(feedback, [{
    kind: MACHINE_FEEDBACK_KIND.RUNTIME_ERROR,
    message: "The overlay interaction failed. Try the action again.",
  }]);
});

test("double-click on an existing pin removes it", () => {
  const { controller, store } = createHarness();
  controller.loadImage({
    src: "data:image/png;base64,abc",
    width: 800,
    height: 400,
  });

  controller.handleDoubleClick({ x: 600, y: 320 });
  const result = controller.handleDoubleClick({ x: 600, y: 320 });

  assert.equal(result.ok, true);
  assert.equal(result.action, "removed");
  assert.equal(store.getState().registration.pins.length, 0);
});

test("computeTransform solves from pins and clears the dirty flag", () => {
  const { controller, store } = createHarness();
  controller.loadImage({
    src: "data:image/png;base64,abc",
    width: 800,
    height: 400,
  });

  controller.handleDoubleClick({ x: 500, y: 300 });
  controller.handleDoubleClick({ x: 700, y: 300 });

  const result = controller.computeTransform();
  assert.equal(result.ok, true);
  assert.equal(store.getState().registration.dirty, false);
  assert.ok(store.getState().registration.solvedTransform);
});

test("interaction runtime transitions are single-source through the runtime reducer", () => {
  const state = createEmptySession({
    mode: SESSION_MODE.ALIGN,
    image: {
      src: "data:image/png;base64,abc",
      width: 800,
      height: 400,
    },
  });
  const baseRuntime = {
    // Final semantic-history shape: this fixture is raw interaction runtime.
    // Keep tests here focused on adapter/input state.
    isDragging: false,
    isPassThroughActive: false,
    isPointerInsideImage: false,
    pointerScreenPx: null,
    dragMode: null,
  };

  const synced = reduceInteractionRuntime(baseRuntime, {
    type: INTERACTION_RUNTIME_ACTION.SYNC_FROM_STATE,
  }, state);
  assert.equal(synced.isDragging, false);

  const dragging = reduceInteractionRuntime(synced, {
    type: INTERACTION_RUNTIME_ACTION.START_DRAG,
    pointerScreenPx: { x: 500, y: 300 },
    isPointerInsideImage: true,
    dragMode: DRAG_MODE.MAP_PAN,
  }, state);
  assert.deepEqual(dragging.pointerScreenPx, { x: 500, y: 300 });
  assert.equal(dragging.isDragging, true);
  assert.equal(dragging.dragMode, DRAG_MODE.MAP_PAN);

  const reset = reduceInteractionRuntime(dragging, {
    type: INTERACTION_RUNTIME_ACTION.RESET,
    pointerScreenPx: null,
    isPointerInsideImage: false,
  }, state);
  assert.equal(reset.isDragging, false);
  assert.equal(reset.dragMode, null);
  assert.equal(reset.isPassThroughActive, false);
  assert.equal(reset.pointerScreenPx, null);

  const unchanged = reduceInteractionRuntime(reset, {
    type: INTERACTION_RUNTIME_ACTION.UPDATE_POINTER,
    pointerScreenPx: null,
    isPointerInsideImage: false,
  }, state);
  assert.equal(unchanged, reset);
});

test("adding a pin preserves the current rendered placement after a solved transform exists", () => {
  const { controller, store, pageAdapter } = createHarness();
  controller.loadImage({
    src: "data:image/png;base64,abc",
    width: 800,
    height: 400,
  });

  controller.handleDoubleClick({ x: 500, y: 300 });
  controller.handleDoubleClick({ x: 700, y: 300 });
  controller.computeTransform();

  const before = resolveOverlayScreenTransform({
    state: store.getState(),
    snapshot: pageAdapter.getSnapshot(),
  });

  controller.handleDoubleClick({ x: 650, y: 340 });

  const after = resolveOverlayScreenTransform({
    state: store.getState(),
    snapshot: pageAdapter.getSnapshot(),
  });

  assert.deepEqual(after, before);
  assert.equal(store.getState().registration.dirty, true);
  assert.equal(store.getState().registration.pins.length, 3);
});

test("removing a pin preserves the current rendered placement after a solved transform exists", () => {
  const { controller, store, pageAdapter } = createHarness();
  controller.loadImage({
    src: "data:image/png;base64,abc",
    width: 800,
    height: 400,
  });

  controller.handleDoubleClick({ x: 500, y: 300 });
  controller.handleDoubleClick({ x: 700, y: 300 });
  controller.computeTransform();

  const before = resolveOverlayScreenTransform({
    state: store.getState(),
    snapshot: pageAdapter.getSnapshot(),
  });

  controller.handleDoubleClick({ x: 500, y: 300 });

  const after = resolveOverlayScreenTransform({
    state: store.getState(),
    snapshot: pageAdapter.getSnapshot(),
  });

  assert.deepEqual(after, before);
  assert.equal(store.getState().registration.dirty, true);
  assert.equal(store.getState().registration.pins.length, 1);
});

test("clearing pins preserves the current rendered placement after a solved transform exists", () => {
  const { controller, store, pageAdapter } = createHarness();
  controller.loadImage({
    src: "data:image/png;base64,abc",
    width: 800,
    height: 400,
  });

  controller.handleDoubleClick({ x: 500, y: 300 });
  controller.handleDoubleClick({ x: 700, y: 300 });
  controller.computeTransform();

  const before = resolveOverlayScreenTransform({
    state: store.getState(),
    snapshot: pageAdapter.getSnapshot(),
  });

  controller.clearPins();

  const after = resolveOverlayScreenTransform({
    state: store.getState(),
    snapshot: pageAdapter.getSnapshot(),
  });

  assert.deepEqual(after, before);
  assert.deepEqual(store.getState().registration, {
    pins: [],
    solvedTransform: null,
    dirty: false,
  });
});

test("ctrl-wheel rotates the overlay only and marks a solved transform dirty again", () => {
  const { controller, store, machineHost } = createHarness();
  controller.loadImage({
    src: "data:image/png;base64,abc",
    width: 800,
    height: 400,
  });

  controller.handleDoubleClick({ x: 500, y: 300 });
  controller.handleDoubleClick({ x: 700, y: 300 });
  controller.computeTransform();
  assert.equal(store.getState().registration.dirty, false);

  controller.handleWheel({
    deltaY: -100,
    shiftKey: false,
    altKey: false,
    ctrlKey: true,
    screenPoint: { x: 600, y: 320 },
  });

  const rotatedPlacement = store.getState().placement;
  assert.equal(store.getState().registration.dirty, true);
  assert.ok(store.getState().registration.solvedTransform);

  assert.equal(
    consumeHistory(machineHost, MACHINE_EVENT_KIND.UNDO).kind,
    MACHINE_HISTORY_KIND.ROTATE_OVERLAY,
  );
  assert.equal(store.getState().placement.rotationRad, 0);
  assert.equal(store.getState().registration.dirty, false);

  assert.equal(
    consumeHistory(machineHost, MACHINE_EVENT_KIND.REDO).kind,
    MACHINE_HISTORY_KIND.ROTATE_OVERLAY,
  );
  assert.deepEqual(store.getState().placement, rotatedPlacement);
  assert.equal(store.getState().registration.dirty, true);
});

test("ctrl-wheel rotates around the image point under the mouse", () => {
  const { controller, store, pageAdapter } = createHarness();
  controller.loadImage({
    src: "data:image/png;base64,abc",
    width: 800,
    height: 400,
  });

  const anchorScreenPoint = { x: 650, y: 260 };
  const beforeTransform = resolveOverlayScreenTransform({
    state: store.getState(),
    snapshot: pageAdapter.getSnapshot(),
  });
  const anchorImagePoint = screenPointToImagePoint({
    screenPoint: anchorScreenPoint,
    transform: beforeTransform,
  });

  controller.handleWheel({
    deltaY: -100,
    shiftKey: false,
    altKey: false,
    ctrlKey: true,
    screenPoint: anchorScreenPoint,
  });

  const afterTransform = resolveOverlayScreenTransform({
    state: store.getState(),
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
  const { controller, store, adapterCalls } = createHarness();
  controller.loadImage({
    src: "data:image/png;base64,abc",
    width: 800,
    height: 400,
  });

  const initialPlacement = store.getState().placement;
  controller.handleWheel({
    deltaY: -100,
    shiftKey: false,
    altKey: false,
    ctrlKey: false,
    screenPoint: { x: 600, y: 320 },
  });

  assert.deepEqual(store.getState().placement, initialPlacement);
  assert.equal(adapterCalls.mapZoomCalls.length, 1);
  assert.deepEqual(adapterCalls.mapZoomCalls[0].screenPoint, { x: 600, y: 320 });
  assert.equal(adapterCalls.mapZoomCalls[0].deltaY, -100);
});

test("shift-wheel scales around the image point under the mouse", () => {
  const { controller, store, pageAdapter, machineHost } = createHarness();
  controller.loadImage({
    src: "data:image/png;base64,abc",
    width: 800,
    height: 400,
  });

  const anchorScreenPoint = { x: 650, y: 260 };
  const initialPlacement = store.getState().placement;
  const beforeTransform = resolveOverlayScreenTransform({
    state: store.getState(),
    snapshot: pageAdapter.getSnapshot(),
  });
  const anchorImagePoint = screenPointToImagePoint({
    screenPoint: anchorScreenPoint,
    transform: beforeTransform,
  });

  controller.handleWheel({
    deltaY: -100,
    shiftKey: true,
    altKey: false,
    ctrlKey: false,
    screenPoint: anchorScreenPoint,
  });

  const afterTransform = resolveOverlayScreenTransform({
    state: store.getState(),
    snapshot: pageAdapter.getSnapshot(),
  });
  const afterAnchorScreenPoint = imagePointToScreenPoint({
    imagePoint: anchorImagePoint,
    transform: afterTransform,
  });

  assert.ok(Math.abs(afterAnchorScreenPoint.x - anchorScreenPoint.x) < 1e-9);
  assert.ok(Math.abs(afterAnchorScreenPoint.y - anchorScreenPoint.y) < 1e-9);

  const scaledPlacement = store.getState().placement;
  assert.equal(
    consumeHistory(machineHost, MACHINE_EVENT_KIND.UNDO).kind,
    MACHINE_HISTORY_KIND.SCALE_OVERLAY,
  );
  assert.deepEqual(store.getState().placement, initialPlacement);

  assert.equal(
    consumeHistory(machineHost, MACHINE_EVENT_KIND.REDO).kind,
    MACHINE_HISTORY_KIND.SCALE_OVERLAY,
  );
  assert.deepEqual(store.getState().placement, scaledPlacement);
});

test("map pan/zoom gestures keep a solved transform clean until overlay-only editing begins", () => {
  const { controller, store, adapterCalls } = createHarness();
  controller.loadImage({
    src: "data:image/png;base64,abc",
    width: 800,
    height: 400,
  });

  controller.handleDoubleClick({ x: 500, y: 300 });
  controller.handleDoubleClick({ x: 700, y: 300 });
  controller.computeTransform();

  const solvedPlacement = store.getState().placement;
  assert.equal(store.getState().registration.dirty, false);

  controller.handlePointerDown({
    button: 0,
    screenPoint: { x: 500, y: 300 },
    shiftKey: false,
  });
  controller.handlePointerMove({ x: 520, y: 310 });
  controller.handlePointerUp({ x: 520, y: 310 });
  controller.handleWheel({
    deltaY: -100,
    shiftKey: false,
    altKey: false,
    screenPoint: { x: 600, y: 320 },
  });

  assert.deepEqual(store.getState().placement, solvedPlacement);
  assert.equal(store.getState().registration.dirty, false);
  assert.equal(adapterCalls.mapPan.starts.length, 1);
  assert.equal(adapterCalls.mapZoomCalls.length, 1);

  controller.handleWheel({
    deltaY: -100,
    shiftKey: false,
    altKey: false,
    ctrlKey: true,
    screenPoint: { x: 600, y: 320 },
  });

  assert.equal(store.getState().registration.dirty, true);
});

test("ctrl-wheel rotates the overlay without zooming the map", () => {
  const { controller, store, adapterCalls } = createHarness();
  controller.loadImage({
    src: "data:image/png;base64,abc",
    width: 800,
    height: 400,
  });

  controller.handleWheel({
    deltaY: 100,
    shiftKey: false,
    altKey: false,
    ctrlKey: true,
    screenPoint: { x: 600, y: 320 },
  });

  assert.notEqual(store.getState().placement.rotationRad, 0);
  assert.equal(adapterCalls.mapZoomCalls.length, 0);
});

test("alt-wheel adjusts the overlay opacity in align mode without zooming the map", () => {
  const { controller, store, adapterCalls } = createHarness();
  controller.loadImage({
    src: "data:image/png;base64,abc",
    width: 800,
    height: 400,
  });

  const initialOpacity = store.getState().opacity;
  controller.handleWheel({
    deltaY: -100,
    shiftKey: false,
    altKey: true,
    ctrlKey: false,
    screenPoint: { x: 600, y: 320 },
  });

  const adjustedOpacity = store.getState().opacity;
  assert.ok(store.getState().opacity > initialOpacity);
  assert.equal(adapterCalls.mapZoomCalls.length, 0);
  assert.equal(adjustedOpacity, store.getState().opacity);
});

test("alt-wheel adjusts the overlay opacity in trace mode", () => {
  const { controller, store, adapterCalls } = createHarness();
  controller.loadImage({
    src: "data:image/png;base64,abc",
    width: 800,
    height: 400,
  });
  controller.toggleMode();

  const initialOpacity = store.getState().opacity;
  const handled = controller.handleWheel({
    deltaY: 100,
    shiftKey: false,
    altKey: true,
    ctrlKey: false,
    screenPoint: { x: 600, y: 320 },
  });

  const adjustedOpacity = store.getState().opacity;
  assert.equal(handled, true);
  assert.ok(store.getState().opacity < initialOpacity);
  assert.equal(adapterCalls.mapZoomCalls.length, 0);
  assert.equal(adjustedOpacity, store.getState().opacity);
});

test("opacity changes do not create undo steps and survive placement undo", () => {
  const { controller, store, machineHost } = createHarness();
  controller.loadImage({
    src: "data:image/png;base64,abc",
    width: 800,
    height: 400,
  });

  const initialOpacity = store.getState().opacity;
  controller.handleWheel({
    deltaY: -100,
    shiftKey: false,
    altKey: true,
    ctrlKey: false,
    screenPoint: { x: 600, y: 320 },
  });
  const adjustedOpacity = store.getState().opacity;

  controller.handlePointerDown({
    button: 0,
    screenPoint: { x: 500, y: 300 },
    shiftKey: true,
  });
  controller.handlePointerMove({ x: 560, y: 280 });
  controller.handlePointerUp({ x: 560, y: 280 });

  assert.ok(adjustedOpacity > initialOpacity);
  assert.equal(
    consumeHistory(machineHost, MACHINE_EVENT_KIND.UNDO).kind,
    MACHINE_HISTORY_KIND.MOVE_OVERLAY,
  );
  assert.equal(store.getState().opacity, adjustedOpacity);
});

test("toggleing to trace auto-computes a dirty transform when enough pins exist", () => {
  // Final semantic-history shape: keep the visible solve behavior, but assert
  // it as an undoable fit-overlay transition rather than an untracked side
  // effect of toggling mode.
  const { controller, store } = createHarness();
  controller.loadImage({
    src: "data:image/png;base64,abc",
    width: 800,
    height: 400,
  });

  controller.handleDoubleClick({ x: 500, y: 300 });
  controller.handleDoubleClick({ x: 700, y: 300 });
  assert.equal(store.getState().registration.dirty, true);

  controller.toggleMode();

  assert.equal(store.getState().mode, "trace");
  assert.equal(store.getState().registration.dirty, false);
  assert.ok(store.getState().registration.solvedTransform);
});

test("clearing pins emits no low-level telemetry when nothing changed", () => {
  const { controller } = createHarness();
  const events = [];
  controller.subscribeEvents((event) => {
    events.push(event);
  });

  controller.clearPins();

  assert.deepEqual(events, []);
});

test("switching mode clears pass-through and ends any active map pan through one transition path", () => {
  // Final semantic-history shape: keep the low-level runtime reset guarantee,
  // but mode switching itself should be triggered through canonical
  // MODE_SELECTED events, not controller.toggleMode().
  const keyTarget = createKeyTarget();
  const { controller, adapterCalls } = createHarness({ keyTarget });
  controller.loadImage({
    src: "data:image/png;base64,abc",
    width: 800,
    height: 400,
  });

  controller.handlePointerDown({
    button: 0,
    screenPoint: { x: 500, y: 300 },
    shiftKey: false,
  });
  controller.handlePointerMove({ x: 520, y: 310 });
  controller.handlePointerEnter({ x: 520, y: 310 });
  keyTarget.dispatch("keydown", createKeyEvent({ code: "Space" }));

  controller.toggleMode();

  assert.equal(controller.getRuntimeState().isDragging, false);
  assert.equal(controller.getRuntimeState().dragMode, null);
  assert.equal(controller.getRuntimeState().isPassThroughActive, false);
  assert.deepEqual(adapterCalls.mapPan.ends, [{ x: 520, y: 310 }]);
});

test("clearing the image resets runtime and ends any active map pan through one transition path", () => {
  // Final semantic-history shape: runtime cleanup can remain interaction-side,
  // but clear-image semantics and history should be reducer-owned rather than
  // driven by controller.clearImage().
  const { controller, adapterCalls, store } = createHarness();
  controller.loadImage({
    src: "data:image/png;base64,abc",
    width: 800,
    height: 400,
  });

  controller.handlePointerDown({
    button: 0,
    screenPoint: { x: 500, y: 300 },
    shiftKey: false,
  });
  controller.handlePointerMove({ x: 520, y: 310 });
  controller.clearImage();

  assert.equal(store.getState().image, null);
  assert.equal(controller.getRuntimeState().isDragging, false);
  assert.equal(controller.getRuntimeState().dragMode, null);
  assert.equal(controller.getRuntimeState().isPassThroughActive, false);
  assert.equal(controller.getRuntimeState().pointerScreenPx, null);
  assert.equal(controller.getRuntimeState().isPointerInsideImage, false);
  assert.deepEqual(adapterCalls.mapPan.ends, [{ x: 520, y: 310 }]);
});

test("space activates temporary pass-through while aligning", () => {
  // Final semantic-history shape: this remains keyboard/runtime plumbing
  // coverage. User-visible pass-through status should be asserted through
  // canonical UI runtime projection.
  const keyTarget = createKeyTarget();
  const { controller } = createHarness({ keyTarget });
  controller.loadImage({
    src: "data:image/png;base64,abc",
    width: 800,
    height: 400,
  });

  const keydown = createKeyEvent({ code: "Space" });
  keyTarget.dispatch("keydown", keydown);
  assert.equal(controller.getRuntimeState().isPassThroughActive, true);
  assert.equal(keydown.prevented, true);
  assert.equal(keydown.stopped, true);
  assert.equal(keydown.immediatelyStopped, true);
  keyTarget.dispatch("keyup", { code: "Space" });
  assert.equal(controller.getRuntimeState().isPassThroughActive, false);
});

test("pressing P toggles a pin at the current pointer location", () => {
  // Final semantic-history shape: KeyP should eventually assert dispatch of a
  // semantic pin-toggle event, not direct mutation through the interaction
  // controller.
  const keyTarget = createKeyTarget();
  const { controller, store } = createHarness({ keyTarget });
  controller.loadImage({
    src: "data:image/png;base64,abc",
    width: 800,
    height: 400,
  });

  controller.handlePointerEnter({ x: 600, y: 320 });
  const keydown = createKeyEvent({ code: "KeyP" });
  keyTarget.dispatch("keydown", keydown);

  assert.equal(store.getState().registration.pins.length, 1);
  assert.equal(keydown.prevented, true);
  assert.equal(keydown.stopped, true);
  assert.equal(keydown.immediatelyStopped, true);
});

test("pressing P still toggles when focus is on an extension button", () => {
  const keyTarget = createKeyTarget();
  const { controller, store } = createHarness({ keyTarget });
  controller.loadImage({
    src: "data:image/png;base64,abc",
    width: 800,
    height: 400,
  });

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

  assert.equal(store.getState().registration.pins.length, 1);
  assert.equal(keydown.prevented, true);
});

test("keyboard shortcuts can be delivered through the early keyboard gateway", () => {
  // Final semantic-history shape: keep this as delivery/wiring coverage only.
  // The gateway should not define shortcut semantics.
  const keyboardGateway = createKeyboardGatewayHarness();
  const { controller, store } = createHarness({ keyboardGateway });
  controller.loadImage({
    src: "data:image/png;base64,abc",
    width: 800,
    height: 400,
  });

  controller.handlePointerEnter({ x: 600, y: 320 });
  const keydown = createKeyEvent({ code: "KeyP" });
  keyboardGateway.dispatch("keydown", keydown);

  assert.equal(store.getState().registration.pins.length, 1);
});

test("keyboard shortcut resolution is single-source and mode-aware", () => {
  const state = createEmptySession({
    mode: SESSION_MODE.ALIGN,
    image: {
      src: "data:image/png;base64,abc",
      width: 800,
      height: 400,
    },
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
      state: { ...state, mode: "trace" },
    }).keyboard.action,
    null,
  );
});

test("drag mode resolution keeps map pan as the unmodified default", () => {
  assert.equal(
    resolveDragMode({ shiftKey: false }),
    "map-pan",
  );
  assert.equal(
    resolveDragMode({ shiftKey: true }),
    "move-overlay",
  );
});

test("wheel mode resolution is single-source and modifier-aware", () => {
  assert.equal(
    resolveWheelMode({ shiftKey: false, altKey: false, ctrlKey: false }),
    "map-zoom",
  );
  assert.equal(
    resolveWheelMode({ shiftKey: true, altKey: false, ctrlKey: false }),
    "zoom-overlay",
  );
  assert.equal(
    resolveWheelMode({ shiftKey: false, altKey: true, ctrlKey: false }),
    "adjust-opacity",
  );
  assert.equal(
    resolveWheelMode({ shiftKey: false, altKey: false, ctrlKey: true }),
    "rotate-overlay",
  );
  assert.equal(
    resolveWheelMode({ shiftKey: true, altKey: true, ctrlKey: true }),
    "adjust-opacity",
  );
});

test("align capability helpers are the single source of truth for editability", () => {
  assert.equal(
    resolveInputProjection({ state: { mode: "align", image: { src: "x" } } })
      .overlayPolicy.canEditOverlay,
    true,
  );
  assert.equal(
    resolveInputProjection({ state: { mode: "trace", image: { src: "x" } } })
      .overlayPolicy.canEditOverlay,
    false,
  );
  assert.equal(
    resolveInputProjection({ state: { mode: "align", image: null } })
      .overlayPolicy.canEditOverlay,
    false,
  );
  assert.equal(
    resolveInputProjection({
      state: { mode: "align", image: { src: "x" } },
      runtime: { isPassThroughActive: false },
    }).overlayPolicy.ownsPointerHitTesting,
    true,
  );
  assert.equal(
    resolveInputProjection({
      state: { mode: "align", image: { src: "x" } },
      runtime: { isPassThroughActive: true },
    }).overlayPolicy.ownsPointerHitTesting,
    false,
  );
  assert.equal(
    resolveInputProjection({
      state: { mode: "align", image: { src: "x" } },
      runtime: { isPassThroughActive: false },
    }).overlayPolicy.ownsPointerHitTesting,
    true,
  );
  assert.equal(
    resolveInputProjection({
      state: { mode: "align", image: { src: "x" } },
      runtime: { isPassThroughActive: true },
    }).overlayPolicy.ownsPointerHitTesting,
    false,
  );
  assert.equal(
    resolveInputProjection({
      state: { mode: "trace", image: { src: "x" } },
      runtime: { isPassThroughActive: false },
    }).overlayPolicy.ownsPointerHitTesting,
    false,
  );
});

test("gesture ownership helpers are the single source of truth for map-vs-overlay ownership", () => {
  assert.equal(isMapPanDragMode(DRAG_MODE.MAP_PAN), true);
  assert.equal(isMapPanDragMode(DRAG_MODE.MOVE_OVERLAY), false);

  assert.equal(doesDragEditPlacement(DRAG_MODE.MOVE_OVERLAY), true);
  assert.equal(doesDragEditPlacement(DRAG_MODE.MAP_PAN), false);

  assert.equal(doesWheelEditPlacement("zoom-overlay"), true);
  assert.equal(doesWheelEditPlacement("rotate-overlay"), true);
  assert.equal(doesWheelEditPlacement("map-zoom"), false);
  assert.equal(doesWheelEditPlacement("adjust-opacity"), false);
  assert.equal(doesWheelEditOpacity("adjust-opacity"), true);
  assert.equal(doesWheelEditOpacity("map-zoom"), false);
});

test("wheel capability is single-source across modes and modifiers", () => {
  assert.equal(
    resolveInputProjection({
      state: { mode: "align", image: { src: "x" } },
      runtime: { isPassThroughActive: false },
      isPointerOverOverlay: true,
      wheelMode: "map-zoom",
    }).wheel.shouldHandle,
    true,
  );
  assert.equal(
    resolveInputProjection({
      state: { mode: "trace", image: { src: "x" } },
      runtime: { isPassThroughActive: false },
      isPointerOverOverlay: true,
      wheelMode: "map-zoom",
    }).wheel.shouldHandle,
    false,
  );
  assert.equal(
    resolveInputProjection({
      state: { mode: "trace", image: { src: "x" } },
      runtime: { isPassThroughActive: false },
      isPointerOverOverlay: true,
      wheelMode: "adjust-opacity",
    }).wheel.shouldHandle,
    true,
  );
});

test("overlay wheel policy is single-source", () => {
  const state = { mode: "align", image: { src: "x" }, opacity: 0.6 };
  const runtime = { isPassThroughActive: false };

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
  const state = { mode: "align", image: { src: "x" } };
  const runtime = { isPassThroughActive: false };

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
  const state = { mode: "align", image: { src: "x" } };
  const runtime = { isPassThroughActive: false };

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
  const state = { mode: "align", image: { src: "x" } };
  const runtime = { isPassThroughActive: false };

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
      state: { mode: "trace", image: { src: "x" } },
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
  const { controller, store, adapterCalls } = createHarness({
    beginMapPanReturns: false,
  });
  controller.loadImage({
    src: "data:image/png;base64,abc",
    width: 800,
    height: 400,
  });

  const initialPlacement = store.getState().placement;
  const handled = controller.handlePointerDown({
    button: 0,
    screenPoint: { x: 500, y: 300 },
    shiftKey: false,
  });

  assert.equal(handled, false);
  assert.deepEqual(store.getState().placement, initialPlacement);
  assert.equal(controller.getRuntimeState().isDragging, false);
  assert.deepEqual(adapterCalls.mapPan.starts, [{ x: 500, y: 300 }]);
});

test("map zoom does nothing when the page adapter cannot forward it", () => {
  const { controller, store, adapterCalls } = createHarness({
    forwardMapZoomReturns: false,
  });
  controller.loadImage({
    src: "data:image/png;base64,abc",
    width: 800,
    height: 400,
  });

  const initialPlacement = store.getState().placement;
  const handled = controller.handleWheel({
    deltaY: -100,
    shiftKey: false,
    altKey: false,
    ctrlKey: false,
    screenPoint: { x: 600, y: 320 },
  });

  assert.equal(handled, false);
  assert.deepEqual(store.getState().placement, initialPlacement);
  assert.equal(adapterCalls.mapZoomCalls.length, 1);
});

test("pass-through release stays active until the runtime says it can be released", () => {
  assert.equal(
    resolveInputProjection({
      event: createKeyEvent({ code: "Space" }),
      state: { mode: "align" },
      runtime: { isPassThroughActive: false },
    }).passThroughRelease.shouldRelease,
    true,
  );
  assert.equal(
    resolveInputProjection({
      event: createKeyEvent({ code: "Space" }),
      state: { mode: "trace" },
      runtime: { isPassThroughActive: true },
    }).passThroughRelease.shouldRelease,
    true,
  );
  assert.equal(
    resolveInputProjection({
      event: createKeyEvent({ code: "KeyP" }),
      state: { mode: "align" },
      runtime: { isPassThroughActive: true },
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
  const store = {
    getState() {
      return machineHost.getState().session;
    },
  };
  const interactions = createInteractionController({
    machineHost,
    keyTarget,
    keyboardGateway,
    pageAdapter,
  });
  const controller = {
    ...interactions,
    loadImage(image) {
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
    },
    clearImage() {
      machineHost.dispatch({ type: MACHINE_EVENT_KIND.CLEAR_IMAGE });
    },
    toggleMode() {
      machineHost.dispatch({
        type: MACHINE_EVENT_KIND.SELECT_MODE,
        mode: nextSessionMode(machineHost.getState().session.mode),
      });
    },
    computeTransform() {
      const result = machineHost.dispatch({ type: MACHINE_EVENT_KIND.FIT_OVERLAY });
      const solvedTransform = result.state.session.registration.solvedTransform;
      if (solvedTransform && machineHost.getState().session.mode !== SESSION_MODE.ALIGN) {
        machineHost.dispatch({
          type: MACHINE_EVENT_KIND.SELECT_MODE,
          mode: SESSION_MODE.ALIGN,
        });
      }
      return {
        ok: Boolean(solvedTransform),
        solvedTransform,
        pinCount: result.state.session.registration.pins.length,
      };
    },
    clearPins() {
      machineHost.dispatch({
        type: MACHINE_EVENT_KIND.CLEAR_PINS,
        preservedPlacement: derivePreservedPlacement({
          state: machineHost.getState().session,
          pageAdapter,
        }),
      });
    },
  };

  return { controller, store, machineHost, keyTarget, adapterCalls, pageAdapter };
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
