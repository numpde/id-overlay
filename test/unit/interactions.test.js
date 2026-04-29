import test from "node:test";
import assert from "node:assert/strict";

import {
  canCaptureOverlayPointer,
  canEditRegistration,
  createInteractionController,
  doesDragEditPlacement,
  doesWheelEditPlacement,
  DRAG_MODE,
  INTERACTION_RUNTIME_ACTION,
  INTERACTION_MODE,
  isSharedDragMode,
  KEYBOARD_SHORTCUT_ACTION,
  nextMode,
  reduceInteractionRuntime,
  resolveDragMode,
  resolveKeyboardShortcut,
  resolveWheelMode,
  shouldReleasePassThrough,
} from "../../src/core/interactions.js";
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

test("plain drag uses the shared-drag adapter path and keeps placement unchanged", () => {
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
  assert.deepEqual(adapterCalls.sharedDrag.starts, [{ x: 500, y: 300 }]);
  assert.deepEqual(adapterCalls.sharedDrag.moves, [
    {
      screenPoint: { x: 520, y: 310 },
      screenDelta: { x: 20, y: 10 },
    },
    {
      screenPoint: { x: 520, y: 310 },
      screenDelta: { x: 0, y: 0 },
    },
  ]);
  assert.deepEqual(adapterCalls.sharedDrag.ends, [{ x: 520, y: 310 }]);
});

test("double-click adds a pin at the current pointer location", () => {
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
    dragMode: DRAG_MODE.SHARED_PAN,
  }, state);
  assert.deepEqual(dragging.pointerScreenPx, { x: 500, y: 300 });
  assert.equal(dragging.isDragging, true);
  assert.equal(dragging.dragMode, DRAG_MODE.SHARED_PAN);
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

test("shift-wheel scales the overlay only and marks a solved transform dirty again", () => {
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
    shiftKey: true,
    altKey: false,
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
    screenPoint: { x: 600, y: 320 },
  });

  assert.deepEqual(store.getState().placement, initialPlacement);
  assert.equal(adapterCalls.forwardedWheelCalls.length, 1);
  assert.deepEqual(adapterCalls.forwardedWheelCalls[0].screenPoint, { x: 600, y: 320 });
  assert.equal(adapterCalls.forwardedWheelCalls[0].deltaY, -100);
});

test("shared gestures keep a solved transform clean until overlay-only editing begins", () => {
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
  assert.equal(adapterCalls.sharedDrag.starts.length, 1);
  assert.equal(adapterCalls.forwardedWheelCalls.length, 1);

  controller.handleWheel({
    deltaY: -100,
    shiftKey: true,
    altKey: false,
    screenPoint: { x: 600, y: 320 },
  });

  assert.equal(store.getState().registration.dirty, true);
});

test("alt-wheel rotates the overlay without zooming the map", () => {
  const { controller, store, adapterCalls } = createHarness();
  controller.loadImage({
    src: "data:image/png;base64,abc",
    width: 800,
    height: 400,
  });

  controller.handleWheel({
    deltaY: 100,
    shiftKey: false,
    altKey: true,
    screenPoint: { x: 600, y: 320 },
  });

  assert.notEqual(store.getState().placement.rotationRad, 0);
  assert.equal(adapterCalls.forwardedWheelCalls.length, 0);
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

test("switching mode clears pass-through and ends any active shared drag through one transition path", () => {
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
  assert.deepEqual(adapterCalls.sharedDrag.ends, [{ x: 520, y: 310 }]);
});

test("clearing the image resets runtime and ends any active shared drag through one transition path", () => {
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
  assert.deepEqual(adapterCalls.sharedDrag.ends, [{ x: 520, y: 310 }]);
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

test("drag mode resolution keeps shared pan as the unmodified default", () => {
  assert.equal(
    resolveDragMode({ shiftKey: false }),
    "shared-pan",
  );
  assert.equal(
    resolveDragMode({ shiftKey: true }),
    "move-overlay",
  );
});

test("wheel mode resolution is single-source and modifier-aware", () => {
  assert.equal(
    resolveWheelMode({ shiftKey: false, altKey: false }),
    "zoom-both",
  );
  assert.equal(
    resolveWheelMode({ shiftKey: true, altKey: false }),
    "zoom-overlay",
  );
  assert.equal(
    resolveWheelMode({ shiftKey: false, altKey: true }),
    "rotate-overlay",
  );
  assert.equal(
    resolveWheelMode({ shiftKey: true, altKey: true }),
    "rotate-overlay",
  );
});

test("align gesture descriptions stay sourced from the interaction contract", () => {
  assert.equal(
    describeActiveAlignDrag(DRAG_MODE.SHARED_PAN),
    "Shared drag: moving the map and overlay together.",
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
    /Alt\+wheel to rotate the overlay/,
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
});

test("gesture ownership helpers are the single source of truth for shared-vs-overlay ownership", () => {
  assert.equal(isSharedDragMode(DRAG_MODE.SHARED_PAN), true);
  assert.equal(isSharedDragMode(DRAG_MODE.MOVE_OVERLAY), false);

  assert.equal(doesDragEditPlacement(DRAG_MODE.MOVE_OVERLAY), true);
  assert.equal(doesDragEditPlacement(DRAG_MODE.SHARED_PAN), false);

  assert.equal(doesWheelEditPlacement("zoom-overlay"), true);
  assert.equal(doesWheelEditPlacement("rotate-overlay"), true);
  assert.equal(doesWheelEditPlacement("zoom-both"), false);
});

test("shared drag does nothing when the page adapter cannot start it", () => {
  const { controller, store, adapterCalls } = createHarness({
    beginSharedDragReturns: false,
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
  assert.deepEqual(adapterCalls.sharedDrag.starts, [{ x: 500, y: 300 }]);
});

test("shared wheel does nothing when the page adapter cannot forward it", () => {
  const { controller, store, adapterCalls } = createHarness({
    forwardSharedWheelReturns: false,
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
    screenPoint: { x: 600, y: 320 },
  });

  assert.equal(handled, false);
  assert.deepEqual(store.getState().placement, initialPlacement);
  assert.equal(adapterCalls.forwardedWheelCalls.length, 1);
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
  beginSharedDragReturns = true,
  forwardSharedWheelReturns = true,
} = {}) {
  const adapterCalls = {
    sharedDrag: {
      starts: [],
      moves: [],
      ends: [],
    },
    forwardedWheelCalls: [],
  };
  const pageAdapter = createPageAdapter({
    adapterCalls,
    beginSharedDragReturns,
    forwardSharedWheelReturns,
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
  beginSharedDragReturns,
  forwardSharedWheelReturns,
}) {
  return {
    getMapCenter() {
      return { lat: -1.23, lon: 36.84 };
    },
    getSnapshot() {
      return {
        viewportRect: { left: 100, top: 100, width: 800, height: 400 },
        mapView: { center: { lat: -1.23, lon: 36.84 }, zoom: 16 },
      };
    },
    getViewportRect() {
      return { left: 100, top: 100, width: 800, height: 400 };
    },
    mapToScreen(point) {
      return {
        x: 500 + (point.lon - 36.84) * 100,
        y: 300 + (point.lat + 1.23) * 100,
      };
    },
    screenToMap(point) {
      return {
        lat: -1.23 + (point.y - 300) / 100,
        lon: 36.84 + (point.x - 500) / 100,
      };
    },
    beginSharedDrag(screenPoint) {
      adapterCalls.sharedDrag.starts.push(screenPoint);
      return beginSharedDragReturns;
    },
    updateSharedDrag(screenPoint, screenDelta) {
      adapterCalls.sharedDrag.moves.push({ screenPoint, screenDelta });
    },
    endSharedDrag(screenPoint) {
      adapterCalls.sharedDrag.ends.push(screenPoint);
    },
    forwardSharedWheel(payload) {
      adapterCalls.forwardedWheelCalls.push(payload);
      return forwardSharedWheelReturns;
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
