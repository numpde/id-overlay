import test from "node:test";
import assert from "node:assert/strict";

import {
  createInteractionController,
  INTERACTION_MODE,
  KEYBOARD_SHORTCUT_ACTION,
  nextMode,
  resolveKeyboardShortcut,
  shouldReleasePassThrough,
} from "../../src/core/interactions.js";
import { createStateStore } from "../../src/core/state.js";

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
  assert.deepEqual(state.placement.centerMapLatLon, { lat: -1.23, lon: 36.84 });
  assert.equal(state.registration.pins.length, 0);
});

test("dragging updates placement through the adapter", () => {
  const { controller, store } = createHarness();
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
  controller.handlePointerMove({ x: 560, y: 280 });
  controller.handlePointerUp({ x: 560, y: 280 });

  const nextCenter = store.getState().placement.centerMapLatLon;
  assert.ok(Math.abs(nextCenter.lon - 37.44) < 1e-9);
  assert.ok(Math.abs(nextCenter.lat - -1.43) < 1e-9);
});

test("shift-drag uses shared map pan and keeps placement unchanged", () => {
  const { controller, store, adapterCalls } = createHarness();
  controller.loadImage({
    src: "data:image/png;base64,abc",
    width: 800,
    height: 400,
  });
  const initialCenter = store.getState().placement.centerMapLatLon;

  controller.handlePointerDown({
    button: 0,
    screenPoint: { x: 500, y: 300 },
    shiftKey: true,
  });
  controller.handlePointerMove({ x: 520, y: 310 });
  controller.handlePointerUp({ x: 520, y: 310 });

  assert.deepEqual(store.getState().placement.centerMapLatLon, initialCenter);
  assert.deepEqual(adapterCalls.panDeltas, [{ x: 20, y: 10 }, { x: 0, y: 0 }]);
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

test("manual placement edits after solving mark the solved transform dirty again", () => {
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
    screenPoint: { x: 600, y: 320 },
  });

  assert.equal(store.getState().registration.dirty, true);
  assert.ok(store.getState().registration.solvedTransform);
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

test("runtime tracks whether enough pins exist to compute a transform", () => {
  const { controller } = createHarness();
  controller.loadImage({
    src: "data:image/png;base64,abc",
    width: 800,
    height: 400,
  });

  assert.equal(controller.getRuntimeState().canComputeTransform, false);
  controller.handleDoubleClick({ x: 500, y: 300 });
  assert.equal(controller.getRuntimeState().canComputeTransform, false);
  controller.handleDoubleClick({ x: 700, y: 300 });
  assert.equal(controller.getRuntimeState().canComputeTransform, true);
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

function createHarness({ keyTarget = createKeyTarget(), keyboardGateway = null } = {}) {
  const adapterCalls = {
    panDeltas: [],
  };
  const store = createStateStore();
  const controller = createInteractionController({
    store,
    keyTarget,
    keyboardGateway,
    pageAdapter: {
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
      panMapByScreenDelta(delta) {
        adapterCalls.panDeltas.push(delta);
      },
    },
  });

  return { controller, store, keyTarget, adapterCalls };
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
