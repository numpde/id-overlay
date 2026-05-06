import test from "node:test";
import assert from "node:assert/strict";

import {
  MACHINE_HISTORY_KIND,
  MACHINE_MODE,
} from "../../src/core/machine/events.js";
import {
  selectPanelStatusText,
} from "../../src/core/machine/selectors.js";
import {
  selectPanelView,
} from "../../src/content/panel-view-model.js";
import {
  addPin,
  addTwoPins,
  createHost,
  createLoadedHost,
  createTwoPins,
  IMAGE,
  MOVED_PLACEMENT,
  PLACEMENT,
  state,
} from "../helpers/machine-scenarios.js";

test("Trace switch with dirty computable pins is an undoable fit transition", () => {
  const host = createLoadedHost();
  addTwoPins(host);

  const fit = host.selectMode(MACHINE_MODE.TRACE);

  assert.equal(fit.state.session.mode, MACHINE_MODE.TRACE);
  assert.equal(fit.state.session.registration.dirty, false);
  assert.ok(fit.state.session.registration.solvedTransform);
  assert.equal(fit.historyRecord.kind, MACHINE_HISTORY_KIND.FIT_OVERLAY);
  assert.equal(selectPanelView(fit.state).historyControls.undo.title, "Undo fit overlay");

  const undo = host.activateUndo();
  assert.equal(undo.state.session.mode, MACHINE_MODE.ALIGN);
  assert.equal(undo.state.session.registration.dirty, true);
  assert.equal(undo.state.session.registration.solvedTransform, null);

  const redo = host.activateRedo();
  assert.equal(redo.state.session.mode, MACHINE_MODE.TRACE);
  assert.equal(redo.state.session.registration.dirty, false);
  assert.ok(redo.state.session.registration.solvedTransform);
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

  const fit = host.selectMode(MACHINE_MODE.TRACE);

  assert.equal(fit.state.session.mode, MACHINE_MODE.TRACE);
  assert.ok(fit.state.session.registration.solvedTransform);
  assert.equal(fit.historyRecord.kind, MACHINE_HISTORY_KIND.FIT_OVERLAY);
});

test("pin undo and redo land in Align because pins are the visible editable object", () => {
  const host = createLoadedHost();
  addPin(host);
  host.selectMode(MACHINE_MODE.TRACE);

  const undo = host.activateUndo();
  assert.equal(undo.state.session.mode, MACHINE_MODE.ALIGN);
  assert.equal(undo.state.session.registration.pins.length, 0);

  const redo = host.activateRedo();
  assert.equal(redo.state.session.mode, MACHINE_MODE.ALIGN);
  assert.equal(redo.state.session.registration.pins.length, 1);
});

test("pin toggle is a machine-owned semantic transition over adapter facts", () => {
  const host = createLoadedHost();

  const add = addPin(host);

  assert.equal(selectPanelStatusText(add.state), "Added pin 1.");
  assert.equal(add.state.session.registration.pins.length, 1);
  assert.equal(add.historyRecord.kind, MACHINE_HISTORY_KIND.ADD_PIN);

  const remove = addPin(host, {
    existingPinId: 1,
  });

  assert.equal(selectPanelStatusText(remove.state), "Removed pin 1.");
  assert.equal(remove.state.session.registration.pins.length, 0);
  assert.equal(remove.historyRecord.kind, MACHINE_HISTORY_KIND.REMOVE_PIN);
});

test("pin toggle is invalid outside visible Align editing", () => {
  const host = createLoadedHost();
  host.selectMode(MACHINE_MODE.TRACE);
  const before = state(host);

  const result = addPin(host);

  assert.deepEqual(result.state, before);
  assert.equal(result.historyRecord, null);
});

test("registration edits can preserve adapter-derived visible placement", () => {
  const host = createLoadedHost();
  addTwoPins(host);
  host.fitOverlay();
  host.selectMode(MACHINE_MODE.ALIGN);

  const result = addPin(host, {
    imagePx: { x: 300, y: 150 },
    mapLatLon: { lat: -1.1, lon: 37.1 },
    preservedPlacement: MOVED_PLACEMENT,
  });

  assert.deepEqual(result.state.session.placement, MOVED_PLACEMENT);
  assert.equal(result.state.session.registration.pins.length, 3);
  assert.equal(result.state.session.registration.dirty, true);
});

test("clear-pins undo and redo land in Align because pin state is invisible in Trace", () => {
  const host = createLoadedHost();
  addTwoPins(host);
  host.clearPins();
  host.selectMode(MACHINE_MODE.TRACE);

  const undo = host.activateUndo();
  assert.equal(undo.state.session.mode, MACHINE_MODE.ALIGN);
  assert.equal(undo.state.session.registration.pins.length, 2);

  const redo = host.activateRedo();
  assert.equal(redo.state.session.mode, MACHINE_MODE.ALIGN);
  assert.equal(redo.state.session.registration.pins.length, 0);
});

test("clear-pins is invalid in Trace because pins are not visible there", () => {
  const host = createLoadedHost();
  addPin(host);
  host.selectMode(MACHINE_MODE.TRACE);
  const before = state(host);

  const result = host.clearPins();

  assert.deepEqual(result.state, before);
  assert.equal(result.historyRecord, null);
});

test("semantic status notices describe the concrete visible edit", () => {
  let host = createLoadedHost();
  const add = addPin(host);
  assert.equal(selectPanelStatusText(add.state), "Added pin 1.");

  const remove = addPin(host, {
    existingPinId: 1,
  });
  assert.equal(selectPanelStatusText(remove.state), "Removed pin 1.");

  host = createLoadedHost();
  addTwoPins(host);
  const clear = host.clearPins();
  assert.equal(selectPanelStatusText(clear.state), "Cleared 2 pins.");

  host = createLoadedHost();
  addTwoPins(host);
  const fit = host.selectMode(MACHINE_MODE.TRACE);
  assert.equal(selectPanelStatusText(fit.state), "Fit overlay from 2 pins.");
});
