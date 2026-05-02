import test from "node:test";
import assert from "node:assert/strict";

import { createInteractionController } from "../../src/core/interactions.js";
import { createStateStore } from "../../src/core/state.js";
import { createPlacementTransform } from "../../src/core/transform.js";

// Target-spec battery for the semantic-history cut-over. Several tests are
// expected to fail until undo/redo stops restoring raw snapshots and starts
// dispatching state-machine inverse/replay events.

const IMAGE = Object.freeze({
  src: "data:image/png;base64,abc",
  width: 800,
  height: 400,
});

const SNAPSHOT = Object.freeze({
  viewportRect: Object.freeze({ left: 100, top: 100, width: 800, height: 400 }),
  mapView: Object.freeze({
    center: Object.freeze({ lat: -1.23, lon: 36.84 }),
    zoom: 16,
  }),
});

const HISTORY_KIND = Object.freeze({
  LOAD_IMAGE: "load-image",
  CLEAR_IMAGE: "clear-image",
  ADD_PIN: "add-pin",
  CLEAR_PINS: "clear-pins",
  FIT_OVERLAY: "fit-overlay",
  MOVE_OVERLAY: "move-overlay",
});

test("pure mode switches are not history and do not clear redo", () => {
  const { controller, store } = createHarness();
  loadImage(controller);
  addPin(controller);

  expectHistory(store.getUndoDescriptor(), HISTORY_KIND.ADD_PIN);
  expectHistory(controller.undoSessionHistory(), HISTORY_KIND.ADD_PIN);
  assert.equal(store.canRedo(), true);

  controller.toggleMode();

  assert.equal(store.getState().mode, "trace");
  assert.equal(store.canRedo(), true);
  expectHistory(store.getRedoDescriptor(), HISTORY_KIND.ADD_PIN);
});

test("Trace switch with dirty computable pins is an undoable fit transition", () => {
  const { controller, store } = createHarness();
  loadImage(controller);
  addTwoPins(controller);

  assert.equal(store.getState().mode, "align");
  assert.equal(store.getState().registration.dirty, true);
  assert.equal(store.getState().registration.solvedTransform, null);

  controller.toggleMode();

  assert.equal(store.getState().mode, "trace");
  assert.equal(store.getState().registration.dirty, false);
  assert.ok(store.getState().registration.solvedTransform);
  expectHistory(store.getUndoDescriptor(), HISTORY_KIND.FIT_OVERLAY, "Fit overlay from pins");

  expectHistory(controller.undoSessionHistory(), HISTORY_KIND.FIT_OVERLAY, "Fit overlay from pins");
  assert.equal(store.getState().mode, "align");
  assert.equal(store.getState().registration.dirty, true);
  assert.equal(store.getState().registration.solvedTransform, null);
  assert.equal(store.getState().registration.pins.length, 2);

  expectHistory(controller.redoSessionHistory(), HISTORY_KIND.FIT_OVERLAY, "Fit overlay from pins");
  assert.equal(store.getState().mode, "trace");
  assert.equal(store.getState().registration.dirty, false);
  assert.ok(store.getState().registration.solvedTransform);
  assert.equal(store.getState().registration.pins.length, 2);
});

test("Trace switch with ready unsolved pins is still an undoable fit transition", () => {
  const { controller, store } = createHarness({
    initialState: createImageState({
      mode: "align",
      registration: {
        pins: createTwoPins(),
        solvedTransform: null,
        dirty: false,
      },
    }),
  });

  controller.toggleMode();

  assert.equal(store.getState().mode, "trace");
  assert.equal(store.getState().registration.dirty, false);
  assert.ok(store.getState().registration.solvedTransform);
  expectHistory(store.getUndoDescriptor(), HISTORY_KIND.FIT_OVERLAY, "Fit overlay from pins");

  expectHistory(controller.undoSessionHistory(), HISTORY_KIND.FIT_OVERLAY, "Fit overlay from pins");
  assert.equal(store.getState().mode, "align");
  assert.equal(store.getState().registration.solvedTransform, null);
  assert.equal(store.getState().registration.dirty, false);
});

test("pin undo and redo land in Align because pins are the visible editable object", () => {
  const { controller, store } = createHarness();
  loadImage(controller);
  addPin(controller);
  controller.toggleMode();

  expectHistory(controller.undoSessionHistory(), HISTORY_KIND.ADD_PIN);
  assert.equal(store.getState().mode, "align");
  assert.equal(store.getState().registration.pins.length, 0);

  expectHistory(controller.redoSessionHistory(), HISTORY_KIND.ADD_PIN);
  assert.equal(store.getState().mode, "align");
  assert.equal(store.getState().registration.pins.length, 1);
});

test("clear-pins undo and redo land in Align because pin state is invisible in Trace", () => {
  const { controller, store } = createHarness();
  loadImage(controller);
  addTwoPins(controller);
  controller.clearPins();
  controller.toggleMode();

  expectHistory(controller.undoSessionHistory(), HISTORY_KIND.CLEAR_PINS);
  assert.equal(store.getState().mode, "align");
  assert.equal(store.getState().registration.pins.length, 2);

  expectHistory(controller.redoSessionHistory(), HISTORY_KIND.CLEAR_PINS);
  assert.equal(store.getState().mode, "align");
  assert.equal(store.getState().registration.pins.length, 0);
});

test("placement undo and redo preserve the user's current mode", () => {
  const { controller, store } = createHarness();
  loadImage(controller);
  dragOverlay(controller);
  controller.toggleMode();

  assert.equal(store.getState().mode, "trace");

  expectHistory(controller.undoSessionHistory(), HISTORY_KIND.MOVE_OVERLAY);
  assert.equal(store.getState().mode, "trace");

  expectHistory(controller.redoSessionHistory(), HISTORY_KIND.MOVE_OVERLAY);
  assert.equal(store.getState().mode, "trace");
});

test("redoing a loaded image restores the authored image-load context, not a later pure mode switch", () => {
  const { controller, store } = createHarness();
  loadImage(controller);
  controller.toggleMode();

  assert.equal(store.getState().mode, "trace");

  expectHistory(controller.undoSessionHistory(), HISTORY_KIND.LOAD_IMAGE);
  assert.equal(store.getState().image, null);
  assert.equal(store.getState().mode, "trace");

  expectHistory(controller.redoSessionHistory(), HISTORY_KIND.LOAD_IMAGE);
  assert.ok(store.getState().image);
  assert.equal(store.getState().mode, "align");
});

test("clear-image undo restores the image context and redo returns to native Trace", () => {
  const { controller, store } = createHarness();
  loadImage(controller);
  controller.toggleMode();
  controller.clearImage();

  assert.equal(store.getState().image, null);
  assert.equal(store.getState().mode, "trace");

  expectHistory(controller.undoSessionHistory(), HISTORY_KIND.CLEAR_IMAGE);
  assert.ok(store.getState().image);
  assert.equal(store.getState().mode, "trace");

  expectHistory(controller.redoSessionHistory(), HISTORY_KIND.CLEAR_IMAGE);
  assert.equal(store.getState().image, null);
  assert.equal(store.getState().mode, "trace");
});

test("new semantic edits clear redo, but pure mode switches do not", () => {
  const { controller, store } = createHarness();
  loadImage(controller);
  addPin(controller);

  expectHistory(controller.undoSessionHistory(), HISTORY_KIND.ADD_PIN);
  assert.equal(store.canRedo(), true);

  controller.toggleMode();
  assert.equal(store.canRedo(), true);

  controller.toggleMode();
  assert.equal(store.canRedo(), true);

  dragOverlay(controller);
  assert.equal(store.canRedo(), false);
  expectHistory(store.getUndoDescriptor(), HISTORY_KIND.MOVE_OVERLAY);
});

function createHarness({ initialState = {} } = {}) {
  const store = createStateStore(initialState);
  const pageAdapter = createPageAdapter();
  const controller = createInteractionController({
    store,
    pageAdapter,
    keyTarget: createKeyTarget(),
  });

  return { controller, store, pageAdapter };
}

function loadImage(controller) {
  controller.loadImage(IMAGE);
}

function addPin(controller) {
  controller.handleDoubleClick({ x: 500, y: 300 });
}

function addTwoPins(controller) {
  controller.handleDoubleClick({ x: 500, y: 300 });
  controller.handleDoubleClick({ x: 700, y: 300 });
}

function dragOverlay(controller) {
  controller.handlePointerDown({
    button: 0,
    screenPoint: { x: 500, y: 300 },
    shiftKey: true,
  });
  controller.handlePointerMove({ x: 560, y: 280 });
  controller.handlePointerUp({ x: 560, y: 280 });
}

function createImageState({ mode, registration }) {
  return {
    mode,
    image: IMAGE,
    placement: createPlacementTransform({
      image: IMAGE,
      centerMapLatLon: SNAPSHOT.mapView.center,
      scale: 1,
      rotationRad: 0,
      zoom: SNAPSHOT.mapView.zoom,
    }),
    registration,
  };
}

function createTwoPins() {
  return [
    {
      id: 1,
      imagePx: { x: 400, y: 200 },
      mapLatLon: { lat: -1.23, lon: 36.84 },
    },
    {
      id: 2,
      imagePx: { x: 600, y: 200 },
      mapLatLon: { lat: -1.23, lon: 38.84 },
    },
  ];
}

function expectHistory(descriptor, kind, label = null) {
  assert.equal(descriptor?.kind, kind);
  if (label !== null) {
    assert.equal(descriptor?.label, label);
  }
}

function createPageAdapter() {
  return {
    getSnapshot() {
      return SNAPSHOT;
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
    beginMapPan() {
      return true;
    },
    updateMapPan() {},
    endMapPan() {},
    forwardMapZoom() {
      return true;
    },
  };
}

function createKeyTarget() {
  return {
    addEventListener() {},
    removeEventListener() {},
  };
}
