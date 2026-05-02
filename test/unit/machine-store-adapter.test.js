import test from "node:test";
import assert from "node:assert/strict";

import {
  MACHINE_MODE,
  createMachineHost,
} from "../../src/core/machine/index.js";
import { createMachineBackedStateStore } from "../../src/core/machine-store-adapter.js";

const IMAGE = Object.freeze({
  src: "data:image/png;base64,abc",
  width: 800,
  height: 400,
});

const PLACEMENT = Object.freeze({
  type: "similarity",
  a: 1,
  b: 0,
  tx: 10,
  ty: 20,
  scale: 1,
  rotationRad: 0,
});

const MOVED_PLACEMENT = Object.freeze({
  ...PLACEMENT,
  tx: 40,
});

test("machine-backed store exposes the legacy flat session shape from machine state", () => {
  const store = createMachineBackedStateStore(createMachineHost());

  store.loadImageSession(IMAGE, PLACEMENT);
  store.setOpacity(0.75);
  store.setMode(MACHINE_MODE.TRACE);

  assert.deepEqual(store.getState(), {
    mode: MACHINE_MODE.TRACE,
    opacity: 0.75,
    image: IMAGE,
    placement: PLACEMENT,
    registration: {
      pins: [],
      solvedTransform: null,
      dirty: false,
    },
  });
});

test("machine-backed store routes undo and redo through machine history", () => {
  const store = createMachineBackedStateStore(createMachineHost());

  store.loadImageSession(IMAGE, PLACEMENT);

  assert.equal(store.canUndo(), true);
  assert.deepEqual(store.getUndoDescriptor(), {
    kind: "load-image",
    label: "Remove image",
  });
  assert.deepEqual(store.undo(), {
    kind: "load-image",
    label: "Remove image",
  });
  assert.equal(store.getState().image, null);
  assert.equal(store.canRedo(), true);
  assert.deepEqual(store.redo(), {
    kind: "load-image",
    label: "Reload image",
  });
  assert.equal(store.getState().image, IMAGE);
});

test("machine-backed store batches placement sync into one semantic history record", () => {
  const store = createMachineBackedStateStore(createMachineHost());

  store.loadImageSession(IMAGE, PLACEMENT);
  store.beginHistoryBatch({
    kind: "move-overlay",
    label: "Moved overlay",
  });
  store.setPlacement({ ...PLACEMENT, tx: 20 });
  store.setPlacement(MOVED_PLACEMENT);
  assert.equal(store.endHistoryBatch(), true);

  assert.equal(store.getState().placement, MOVED_PLACEMENT);
  assert.deepEqual(store.getUndoDescriptor(), {
    kind: "move-overlay",
    label: "Undo move overlay",
  });

  store.undo();
  assert.equal(store.getState().placement, PLACEMENT);
});

test("machine-backed store preserves interaction pin mutation return values", () => {
  const store = createMachineBackedStateStore(createMachineHost());

  store.loadImageSession(IMAGE, PLACEMENT);
  const pin = store.addPin({
    imagePx: { x: 10, y: 20 },
    mapLatLon: { lat: 1, lon: 2 },
  });

  assert.equal(pin.id, 1);
  assert.equal(store.removePin(pin.id), true);
  assert.equal(store.clearPins(), false);
});
