import test from "node:test";
import assert from "node:assert/strict";

import {
  MACHINE_HISTORY_KIND,
  MACHINE_MODE,
  MACHINE_PLACEMENT_EDIT_KIND,
} from "../../src/core/machine/events.js";
import { createMachineHost } from "../../src/core/machine/host.js";
import { PLACEMENT_EDIT_PLAN_PHASE } from "../../src/core/placement-edit-planning.js";
import {
  selectPanelView,
} from "../../src/content/panel-view-model.js";
import { normalizeSessionImage } from "../../src/core/session.js";

const IMAGE = Object.freeze({
  src: "data:image/png;base64,abc",
  width: 800,
  height: 400,
});
const NORMALIZED_IMAGE = normalizeSessionImage(IMAGE);

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
  ty: 10,
});

test("pure mode switches are not history and do not clear redo", () => {
  const host = createLoadedHost();
  addPin(host);

  let result = undo(host);
  assert.equal(result.consumedHistoryRecord.kind, MACHINE_HISTORY_KIND.ADD_PIN);
  assert.equal(selectPanelView(result.state).historyControls.redo.title, "Add pin");

  result = selectMode(host, MACHINE_MODE.TRACE);

  assert.equal(result.state.session.mode, MACHINE_MODE.TRACE);
  assert.equal(result.state.history.future.length, 1);
  assert.equal(selectPanelView(result.state).historyControls.redo.title, "Add pin");
});

test("Trace switch with dirty computable pins is an undoable fit transition", () => {
  const host = createLoadedHost();
  addTwoPins(host);

  const fit = selectMode(host, MACHINE_MODE.TRACE);

  assert.equal(fit.state.session.mode, MACHINE_MODE.TRACE);
  assert.equal(fit.state.session.registration.dirty, false);
  assert.ok(fit.state.session.registration.solvedTransform);
  assert.equal(fit.historyRecord.kind, MACHINE_HISTORY_KIND.FIT_OVERLAY);
  assert.equal(selectPanelView(fit.state).historyControls.undo.title, "Undo fit overlay");

  const undoResult = undo(host);
  assert.equal(undoResult.consumedHistoryRecord.kind, MACHINE_HISTORY_KIND.FIT_OVERLAY);
  assert.equal(undoResult.state.session.mode, MACHINE_MODE.ALIGN);
  assert.equal(undoResult.state.session.registration.dirty, true);
  assert.equal(undoResult.state.session.registration.solvedTransform, null);
  assert.equal(undoResult.state.session.registration.pins.length, 2);

  const redoResult = redo(host);
  assert.equal(redoResult.consumedHistoryRecord.kind, MACHINE_HISTORY_KIND.FIT_OVERLAY);
  assert.equal(redoResult.state.session.mode, MACHINE_MODE.TRACE);
  assert.equal(redoResult.state.session.registration.dirty, false);
  assert.ok(redoResult.state.session.registration.solvedTransform);
  assert.equal(redoResult.state.session.registration.pins.length, 2);
});

test("Trace switch with ready unsolved pins is still an undoable fit transition", () => {
  const host = createHost({
    persistedSession: {
      mode: MACHINE_MODE.ALIGN,
      opacity: 0.6,
      image: IMAGE,
      placement: PLACEMENT,
      registration: {
        pins: createTwoPins(),
        solvedTransform: null,
        dirty: false,
      },
    },
  });

  const fit = selectMode(host, MACHINE_MODE.TRACE);

  assert.equal(fit.state.session.mode, MACHINE_MODE.TRACE);
  assert.ok(fit.state.session.registration.solvedTransform);
  assert.equal(fit.historyRecord.kind, MACHINE_HISTORY_KIND.FIT_OVERLAY);

  const undoResult = undo(host);
  assert.equal(undoResult.state.session.mode, MACHINE_MODE.ALIGN);
  assert.equal(undoResult.state.session.registration.solvedTransform, null);
  assert.equal(undoResult.state.session.registration.dirty, false);
});

test("pin undo and redo land in Align because pins are the visible editable object", () => {
  const host = createLoadedHost();
  addPin(host);
  selectMode(host, MACHINE_MODE.TRACE);

  const undoResult = undo(host);
  assert.equal(undoResult.consumedHistoryRecord.kind, MACHINE_HISTORY_KIND.ADD_PIN);
  assert.equal(undoResult.state.session.mode, MACHINE_MODE.ALIGN);
  assert.equal(undoResult.state.session.registration.pins.length, 0);

  const redoResult = redo(host);
  assert.equal(redoResult.consumedHistoryRecord.kind, MACHINE_HISTORY_KIND.ADD_PIN);
  assert.equal(redoResult.state.session.mode, MACHINE_MODE.ALIGN);
  assert.equal(redoResult.state.session.registration.pins.length, 1);
});

test("clear-pins undo and redo land in Align because pin state is invisible in Trace", () => {
  const host = createLoadedHost();
  addTwoPins(host);
  clearPins(host);
  selectMode(host, MACHINE_MODE.TRACE);

  const undoResult = undo(host);
  assert.equal(undoResult.consumedHistoryRecord.kind, MACHINE_HISTORY_KIND.CLEAR_PINS);
  assert.equal(undoResult.state.session.mode, MACHINE_MODE.ALIGN);
  assert.equal(undoResult.state.session.registration.pins.length, 2);

  const redoResult = redo(host);
  assert.equal(redoResult.consumedHistoryRecord.kind, MACHINE_HISTORY_KIND.CLEAR_PINS);
  assert.equal(redoResult.state.session.mode, MACHINE_MODE.ALIGN);
  assert.equal(redoResult.state.session.registration.pins.length, 0);
});

test("placement undo and redo preserve the user's current mode", () => {
  const host = createLoadedHost();
  applyPlacement(host, MACHINE_PLACEMENT_EDIT_KIND.MOVE, MOVED_PLACEMENT);
  selectMode(host, MACHINE_MODE.TRACE);

  const undoResult = undo(host);
  assert.equal(undoResult.consumedHistoryRecord.kind, MACHINE_HISTORY_KIND.MOVE_OVERLAY);
  assert.equal(undoResult.state.session.mode, MACHINE_MODE.TRACE);
  assert.deepEqual(undoResult.state.session.placement, PLACEMENT);

  const redoResult = redo(host);
  assert.equal(redoResult.consumedHistoryRecord.kind, MACHINE_HISTORY_KIND.MOVE_OVERLAY);
  assert.equal(redoResult.state.session.mode, MACHINE_MODE.TRACE);
  assert.deepEqual(redoResult.state.session.placement, MOVED_PLACEMENT);
});

test("redoing a loaded image restores the authored image-load context, not a later pure mode switch", () => {
  const host = createLoadedHost();
  selectMode(host, MACHINE_MODE.TRACE);

  const undoResult = undo(host);
  assert.equal(undoResult.consumedHistoryRecord.kind, MACHINE_HISTORY_KIND.LOAD_IMAGE);
  assert.equal(undoResult.state.session.image, null);
  assert.equal(undoResult.state.session.mode, MACHINE_MODE.TRACE);

  const redoResult = redo(host);
  assert.equal(redoResult.consumedHistoryRecord.kind, MACHINE_HISTORY_KIND.LOAD_IMAGE);
  assert.deepEqual(redoResult.state.session.image, NORMALIZED_IMAGE);
  assert.equal(redoResult.state.session.mode, MACHINE_MODE.ALIGN);
});

test("clear-image undo restores the image context and redo returns to native Trace", () => {
  const host = createLoadedHost();
  selectMode(host, MACHINE_MODE.TRACE);
  clearImage(host);

  assert.equal(state(host).session.image, null);
  assert.equal(state(host).session.mode, MACHINE_MODE.TRACE);

  const undoResult = undo(host);
  assert.equal(undoResult.consumedHistoryRecord.kind, MACHINE_HISTORY_KIND.CLEAR_IMAGE);
  assert.deepEqual(undoResult.state.session.image, NORMALIZED_IMAGE);
  assert.equal(undoResult.state.session.mode, MACHINE_MODE.TRACE);

  const redoResult = redo(host);
  assert.equal(redoResult.consumedHistoryRecord.kind, MACHINE_HISTORY_KIND.CLEAR_IMAGE);
  assert.equal(redoResult.state.session.image, null);
  assert.equal(redoResult.state.session.mode, MACHINE_MODE.TRACE);
});

test("new semantic edits clear redo, but pure mode switches do not", () => {
  const host = createLoadedHost();
  addPin(host);

  undo(host);
  assert.equal(state(host).history.future.length, 1);

  selectMode(host, MACHINE_MODE.TRACE);
  assert.equal(state(host).history.future.length, 1);
  selectMode(host, MACHINE_MODE.ALIGN);
  assert.equal(state(host).history.future.length, 1);

  applyPlacement(host, MACHINE_PLACEMENT_EDIT_KIND.MOVE, MOVED_PLACEMENT);
  assert.equal(state(host).history.future.length, 0);
  assert.equal(state(host).history.past.at(-1).kind, MACHINE_HISTORY_KIND.MOVE_OVERLAY);
});

function createHost({ persistedSession = null } = {}) {
  return createMachineHost({ persistedSession });
}

function createLoadedHost() {
  const host = createHost();
  loadImage(host);
  return host;
}

function state(host) {
  return host.getState();
}

function loadImage(host) {
  return host.loadImage({
    image: IMAGE,
    placement: PLACEMENT,
  });
}

function addPin(host, {
  imagePx = { x: 400, y: 200 },
  mapLatLon = { lat: -1.23, lon: 36.84 },
} = {}) {
  return host.togglePin({ imagePx, mapLatLon });
}

function addTwoPins(host) {
  addPin(host, {
    imagePx: { x: 400, y: 200 },
    mapLatLon: { lat: -1.23, lon: 36.84 },
  });
  addPin(host, {
    imagePx: { x: 600, y: 200 },
    mapLatLon: { lat: -1.23, lon: 38.84 },
  });
}

function selectMode(host, mode) {
  return host.selectMode(mode);
}

function clearPins(host) {
  return host.clearPins();
}

function clearImage(host) {
  return host.clearImage();
}

function applyPlacement(host, editKind, placement) {
  return host.applyPlacementEditPlan({
    phase: PLACEMENT_EDIT_PLAN_PHASE.APPLY,
    kind: editKind,
    renderedPlacement: PLACEMENT,
    placement,
  });
}

function undo(host) {
  return host.activateUndo();
}

function redo(host) {
  return host.activateRedo();
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
