import test from "node:test";
import assert from "node:assert/strict";

import {
  canHandleWheelGesture,
  canCaptureOverlayPointer,
  canEditRegistration,
  canTrackOverlayPointer,
  canToggleOverlayPin,
  createInteractionController,
  doesDragEditPlacement,
  doesWheelEditOpacity,
  doesWheelEditPlacement,
  DRAG_MODE,
  INTERACTION_RUNTIME_ACTION,
  INTERACTION_EVENT,
  INTERACTION_MODE,
  isMapPanDragMode,
  KEYBOARD_SHORTCUT_ACTION,
  nextMode,
  reduceInteractionRuntime,
  resolveOverlayActivationPolicy,
  resolveOverlayPointerMovePolicy,
  resolveOverlayPointerSequencePolicy,
  resolveOverlayWheelPolicy,
  resolveDragMode,
  resolveKeyboardShortcut,
  resolveWheelMode,
  shouldReleasePassThrough,
  WHEEL_MODE,
} from "../../src/core/interactions.js";
import { RUNTIME_ERROR_SOURCE } from "../../src/core/runtime-error.js";
import {
  describeActiveAlignDrag,
  describeAlignGestureContract,
} from "../../src/core/presentation.js";
import { createStateStore } from "../../src/core/state.js";
import {
  createPlacementScreenTransform,
  imagePointToScreenPoint,
  resolveOverlayScreenTransform,
} from "../../src/core/transform.js";

test("nextMode toggles between align and trace", () => {
  assert.equal(nextMode(INTERACTION_MODE.TRACE), INTERACTION_MODE.ALIGN);
  assert.equal(nextMode(INTERACTION_MODE.ALIGN), INTERACTION_MODE.TRACE);
});

test("loading an image seeds align mode and the current map center placement", () => {
  const { controller, store } = createHarness();

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
  const { controller, store } = createHarness();
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
  const { controller } = createHarness({
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

  const result = controller.handleDoubleClick({ x: 600, y: 320 });

  assert.equal(result.ok, false);
  assert.equal(events.length, 1);
  assert.equal(events[0].type, INTERACTION_EVENT.RUNTIME_ERROR);
  assert.equal(events[0].error.source, RUNTIME_ERROR_SOURCE.INTERACTIONS);
  assert.equal(events[0].error.operation, "handle-double-click");
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
  const state = createStateStore({
    mode: "align",
    image: {
      src: "data:image/png;base64,abc",
      width: 800,
      height: 400,
    },
  }).getState();
  const baseRuntime = {
    canCapturePointer: false,
    isDragging: false,
    isPassThroughActive: false,
    isPointerInsideImage: false,
    pointerScreenPx: null,
    dragMode: null,
  };

  const synced = reduceInteractionRuntime(baseRuntime, {
    type: INTERACTION_RUNTIME_ACTION.SYNC_FROM_STATE,
  }, state);
  assert.equal(synced.canCapturePointer, true);
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
  assert.equal(dragging.canCapturePointer, true);

  const reset = reduceInteractionRuntime(dragging, {
    type: INTERACTION_RUNTIME_ACTION.RESET,
    pointerScreenPx: null,
    isPointerInsideImage: false,
  }, state);
  assert.equal(reset.isDragging, false);
  assert.equal(reset.dragMode, null);
  assert.equal(reset.isPassThroughActive, false);
  assert.equal(reset.pointerScreenPx, null);
  assert.equal(reset.canCapturePointer, true);

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
  const { controller, store } = createHarness();
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

  assert.equal(store.getState().registration.dirty, true);
  assert.ok(store.getState().registration.solvedTransform);
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

  assert.ok(store.getState().opacity > initialOpacity);
  assert.equal(adapterCalls.mapZoomCalls.length, 0);
});

test("alt-wheel adjusts the overlay opacity in trace mode", () => {
  const { controller, store, adapterCalls } = createHarness();
  controller.loadImage({
    src: "data:image/png;base64,abc",
    width: 800,
    height: 400,
  });
  controller.setMode("trace");

  const initialOpacity = store.getState().opacity;
  const handled = controller.handleWheel({
    deltaY: 100,
    shiftKey: false,
    altKey: true,
    ctrlKey: false,
    screenPoint: { x: 600, y: 320 },
  });

  assert.equal(handled, true);
  assert.ok(store.getState().opacity < initialOpacity);
  assert.equal(adapterCalls.mapZoomCalls.length, 0);
});

test("toggleing to trace auto-computes a dirty transform when enough pins exist", () => {
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

test("clearing pins emits no event when nothing changed", () => {
  const { controller } = createHarness();
  const events = [];
  controller.subscribeEvents((event) => {
    events.push(event);
  });

  controller.clearPins();

  assert.deepEqual(events, []);
});

test("switching mode clears pass-through and ends any active map pan through one transition path", () => {
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
  const state = createStateStore({
    mode: "align",
    image: {
      src: "data:image/png;base64,abc",
      width: 800,
      height: 400,
    },
  }).getState();

  assert.equal(
    resolveKeyboardShortcut({
      event: createKeyEvent({ code: "KeyP" }),
      state,
    }),
    KEYBOARD_SHORTCUT_ACTION.TOGGLE_PIN_CURRENT_POINTER,
  );
  assert.equal(
    resolveKeyboardShortcut({
      event: createKeyEvent({ code: "Escape" }),
      state,
    }),
    KEYBOARD_SHORTCUT_ACTION.SWITCH_TO_TRACE,
  );
  assert.equal(
    resolveKeyboardShortcut({
      event: createKeyEvent({ code: "Space" }),
      state,
    }),
    KEYBOARD_SHORTCUT_ACTION.ENABLE_PASS_THROUGH,
  );
  assert.equal(
    resolveKeyboardShortcut({
      event: createKeyEvent({ code: "KeyP" }),
      state: { ...state, mode: "trace" },
    }),
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

test("align gesture descriptions stay sourced from the interaction contract", () => {
  assert.equal(
    describeActiveAlignDrag(DRAG_MODE.MAP_PAN),
    "Panning the map while the overlay follows.",
  );
  assert.equal(
    describeActiveAlignDrag(DRAG_MODE.MOVE_OVERLAY),
    "Dragging overlay only. Release to keep this placement.",
  );
  assert.match(
    describeAlignGestureContract(),
    /Shift\+drag to move only the overlay/,
  );
  assert.match(
    describeAlignGestureContract(),
    /Shift\+wheel to scale only the overlay/,
  );
  assert.match(
    describeAlignGestureContract(),
    /Ctrl\+wheel to rotate the overlay/,
  );
  assert.match(
    describeAlignGestureContract(),
    /Alt\+wheel to adjust opacity/,
  );
});

test("align capability helpers are the single source of truth for editability", () => {
  assert.equal(canEditRegistration({ mode: "align", image: { src: "x" } }), true);
  assert.equal(canEditRegistration({ mode: "trace", image: { src: "x" } }), false);
  assert.equal(canEditRegistration({ mode: "align", image: null }), false);
  assert.equal(
    canCaptureOverlayPointer({
      state: { mode: "align", image: { src: "x" } },
      runtime: { isPassThroughActive: false },
    }),
    true,
  );
  assert.equal(
    canCaptureOverlayPointer({
      state: { mode: "align", image: { src: "x" } },
      runtime: { isPassThroughActive: true },
    }),
    false,
  );
  assert.equal(
    canTrackOverlayPointer({
      state: { mode: "align", image: { src: "x" } },
      runtime: { isPassThroughActive: false },
    }),
    true,
  );
  assert.equal(
    canTrackOverlayPointer({
      state: { mode: "align", image: { src: "x" } },
      runtime: { isPassThroughActive: true },
    }),
    false,
  );
  assert.equal(
    canTrackOverlayPointer({
      state: { mode: "trace", image: { src: "x" } },
      runtime: { isPassThroughActive: false },
    }),
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
    canHandleWheelGesture({
      state: { mode: "align", image: { src: "x" } },
      runtime: { isPassThroughActive: false, canCapturePointer: true },
      wheelMode: "map-zoom",
    }),
    true,
  );
  assert.equal(
    canHandleWheelGesture({
      state: { mode: "trace", image: { src: "x" } },
      runtime: { isPassThroughActive: false, canCapturePointer: false },
      wheelMode: "map-zoom",
    }),
    false,
  );
  assert.equal(
    canHandleWheelGesture({
      state: { mode: "trace", image: { src: "x" } },
      runtime: { isPassThroughActive: false, canCapturePointer: false },
      wheelMode: "adjust-opacity",
    }),
    true,
  );
});

test("overlay wheel policy is single-source", () => {
  const state = { mode: "align", image: { src: "x" }, opacity: 0.6 };
  const runtime = { isPassThroughActive: false, canCapturePointer: true };

  assert.deepEqual(
    resolveOverlayWheelPolicy({
      state,
      runtime,
      shiftKey: false,
      altKey: false,
      ctrlKey: false,
    }),
    {
      wheelMode: WHEEL_MODE.MAP_ZOOM,
      shouldIntercept: false,
    },
  );

  assert.deepEqual(
    resolveOverlayWheelPolicy({
      state,
      runtime,
      shiftKey: false,
      altKey: true,
      ctrlKey: false,
    }),
    {
      wheelMode: WHEEL_MODE.ADJUST_OPACITY,
      shouldIntercept: true,
    },
  );
});

test("overlay pointer move policy is single-source", () => {
  const state = { mode: "align", image: { src: "x" } };
  const runtime = { canCapturePointer: true, isPassThroughActive: false };

  assert.deepEqual(
    resolveOverlayPointerMovePolicy({
      state,
      runtime,
      isPointerOverOverlay: false,
    }),
    {
      shouldTrackPointer: false,
    },
  );

  assert.deepEqual(
    resolveOverlayPointerMovePolicy({
      state,
      runtime,
      isPointerOverOverlay: true,
    }),
    {
      shouldTrackPointer: true,
    },
  );

  assert.deepEqual(
    resolveOverlayPointerMovePolicy({
      state,
      runtime,
      isPointerOverOverlay: true,
      buttons: 1,
    }),
    {
      shouldTrackPointer: false,
    },
  );
});

test("overlay pointer sequence policy is single-source", () => {
  const state = { mode: "align", image: { src: "x" } };
  const runtime = { canCapturePointer: true, isPassThroughActive: false };

  assert.deepEqual(
    resolveOverlayPointerSequencePolicy({
      state,
      runtime,
      isPointerOverOverlay: false,
      button: 0,
      shiftKey: false,
    }),
    {
      shouldOwnPointerSequence: false,
      dragMode: null,
    },
  );

  assert.deepEqual(
    resolveOverlayPointerSequencePolicy({
      state,
      runtime,
      isPointerOverOverlay: true,
      button: 0,
      shiftKey: false,
    }),
    {
      shouldOwnPointerSequence: true,
      dragMode: DRAG_MODE.MAP_PAN,
    },
  );

  assert.deepEqual(
    resolveOverlayPointerSequencePolicy({
      state,
      runtime,
      isPointerOverOverlay: true,
      button: 0,
      shiftKey: true,
    }),
    {
      shouldOwnPointerSequence: true,
      dragMode: DRAG_MODE.MOVE_OVERLAY,
    },
  );

  assert.deepEqual(
    resolveOverlayPointerSequencePolicy({
      state,
      runtime,
      isPointerOverOverlay: true,
      button: 1,
      shiftKey: true,
    }),
    {
      shouldOwnPointerSequence: false,
      dragMode: null,
    },
  );
});

test("overlay activation policy is single-source", () => {
  const state = { mode: "align", image: { src: "x" } };
  const runtime = { canCapturePointer: true, isPassThroughActive: false };

  assert.deepEqual(
    resolveOverlayActivationPolicy({
      state,
      runtime,
      isPointerOverOverlay: false,
    }),
    {
      shouldConsumeClick: false,
      shouldTogglePin: false,
    },
  );

  assert.deepEqual(
    resolveOverlayActivationPolicy({
      state,
      runtime,
      isPointerOverOverlay: true,
    }),
    {
      shouldConsumeClick: true,
      shouldTogglePin: true,
    },
  );

  assert.deepEqual(
    resolveOverlayActivationPolicy({
      state: { mode: "trace", image: { src: "x" } },
      runtime,
      isPointerOverOverlay: true,
    }),
    {
      shouldConsumeClick: false,
      shouldTogglePin: false,
    },
  );

  assert.equal(
    canToggleOverlayPin({
      state,
      runtime,
      isPointerOverOverlay: true,
    }),
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
    shouldReleasePassThrough({
      event: createKeyEvent({ code: "Space" }),
      state: { mode: "align" },
      runtime: { isPassThroughActive: false },
    }),
    true,
  );
  assert.equal(
    shouldReleasePassThrough({
      event: createKeyEvent({ code: "Space" }),
      state: { mode: "trace" },
      runtime: { isPassThroughActive: true },
    }),
    true,
  );
  assert.equal(
    shouldReleasePassThrough({
      event: createKeyEvent({ code: "KeyP" }),
      state: { mode: "align" },
      runtime: { isPassThroughActive: true },
    }),
    false,
  );
});

function createHarness({
  keyTarget = createKeyTarget(),
  keyboardGateway = null,
  beginMapPanReturns = true,
  forwardMapZoomReturns = true,
  screenToMapThrows = null,
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
  });
  const store = createStateStore();
  const controller = createInteractionController({
    store,
    keyTarget,
    keyboardGateway,
    pageAdapter,
  });

  return { controller, store, keyTarget, adapterCalls, pageAdapter };
}

function createPageAdapter({
  adapterCalls,
  beginMapPanReturns,
  forwardMapZoomReturns,
  screenToMapThrows,
}) {
  return {
    getSnapshot() {
      return {
        viewportRect: { left: 100, top: 100, width: 800, height: 400 },
        mapView: { center: { lat: -1.23, lon: 36.84 }, zoom: 16 },
      };
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
