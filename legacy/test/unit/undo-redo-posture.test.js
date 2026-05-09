import test from "node:test";
import assert from "node:assert/strict";

import {
  MACHINE_HISTORY_KIND,
  MACHINE_MODE,
} from "../../src/core/machine/events.js";
import {
  selectPanelView,
} from "../../src/content/panel-view-model.js";
import {
  addPin,
  addTwoPins,
  applyPlacement,
  createHost,
  createLoadedHost,
  createTwoPins,
  IMAGE,
  MOVED_PLACEMENT,
  NORMALIZED_IMAGE,
  PLACEMENT,
  state,
} from "../helpers/machine-scenarios.js";

test("pure mode switches are not history and do not clear redo", () => {
  const host = createLoadedHost();
  addPin(host);

  let result = host.activateUndo();
  assert.equal(result.consumedHistoryRecord.kind, MACHINE_HISTORY_KIND.ADD_PIN);
  assert.equal(selectPanelView(result.state).historyControls.redo.title, "Add pin");

  result = host.selectMode(MACHINE_MODE.TRACE);

  assert.equal(result.state.session.mode, MACHINE_MODE.TRACE);
  assert.equal(result.state.history.future.length, 1);
  assert.equal(selectPanelView(result.state).historyControls.redo.title, "Add pin");
});

test("Trace switch with dirty computable pins is an undoable fit transition", () => {
  const host = createLoadedHost();
  addTwoPins(host);

  const fit = host.selectMode(MACHINE_MODE.TRACE);

  assert.equal(fit.state.session.mode, MACHINE_MODE.TRACE);
  assert.equal(fit.state.session.registration.dirty, false);
  assert.ok(fit.state.session.registration.solvedTransform);
  assert.equal(fit.historyRecord.kind, MACHINE_HISTORY_KIND.FIT_OVERLAY);
  assert.equal(selectPanelView(fit.state).historyControls.undo.title, "Undo fit overlay");

  const undoResult = host.activateUndo();
  assert.equal(undoResult.consumedHistoryRecord.kind, MACHINE_HISTORY_KIND.FIT_OVERLAY);
  assert.equal(undoResult.state.session.mode, MACHINE_MODE.ALIGN);
  assert.equal(undoResult.state.session.registration.dirty, true);
  assert.equal(undoResult.state.session.registration.solvedTransform, null);
  assert.equal(undoResult.state.session.registration.pins.length, 2);

  const redoResult = host.activateRedo();
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

  const fit = host.selectMode(MACHINE_MODE.TRACE);

  assert.equal(fit.state.session.mode, MACHINE_MODE.TRACE);
  assert.ok(fit.state.session.registration.solvedTransform);
  assert.equal(fit.historyRecord.kind, MACHINE_HISTORY_KIND.FIT_OVERLAY);

  const undoResult = host.activateUndo();
  assert.equal(undoResult.state.session.mode, MACHINE_MODE.ALIGN);
  assert.equal(undoResult.state.session.registration.solvedTransform, null);
  assert.equal(undoResult.state.session.registration.dirty, false);
});

test("pin undo and redo land in Align because pins are the visible editable object", () => {
  const host = createLoadedHost();
  addPin(host);
  host.selectMode(MACHINE_MODE.TRACE);

  const undoResult = host.activateUndo();
  assert.equal(undoResult.consumedHistoryRecord.kind, MACHINE_HISTORY_KIND.ADD_PIN);
  assert.equal(undoResult.state.session.mode, MACHINE_MODE.ALIGN);
  assert.equal(undoResult.state.session.registration.pins.length, 0);

  const redoResult = host.activateRedo();
  assert.equal(redoResult.consumedHistoryRecord.kind, MACHINE_HISTORY_KIND.ADD_PIN);
  assert.equal(redoResult.state.session.mode, MACHINE_MODE.ALIGN);
  assert.equal(redoResult.state.session.registration.pins.length, 1);
});

test("clear-pins undo and redo land in Align because pin state is invisible in Trace", () => {
  const host = createLoadedHost();
  addTwoPins(host);
  host.clearPins();
  host.selectMode(MACHINE_MODE.TRACE);

  const undoResult = host.activateUndo();
  assert.equal(undoResult.consumedHistoryRecord.kind, MACHINE_HISTORY_KIND.CLEAR_PINS);
  assert.equal(undoResult.state.session.mode, MACHINE_MODE.ALIGN);
  assert.equal(undoResult.state.session.registration.pins.length, 2);

  const redoResult = host.activateRedo();
  assert.equal(redoResult.consumedHistoryRecord.kind, MACHINE_HISTORY_KIND.CLEAR_PINS);
  assert.equal(redoResult.state.session.mode, MACHINE_MODE.ALIGN);
  assert.equal(redoResult.state.session.registration.pins.length, 0);
});

test("placement undo and redo preserve the user's current mode", () => {
  const host = createLoadedHost();
  applyPlacement(host, {
    placement: MOVED_PLACEMENT,
  });
  host.selectMode(MACHINE_MODE.TRACE);

  const undoResult = host.activateUndo();
  assert.equal(undoResult.consumedHistoryRecord.kind, MACHINE_HISTORY_KIND.MOVE_OVERLAY);
  assert.equal(undoResult.state.session.mode, MACHINE_MODE.TRACE);
  assert.deepEqual(undoResult.state.session.placement, PLACEMENT);

  const redoResult = host.activateRedo();
  assert.equal(redoResult.consumedHistoryRecord.kind, MACHINE_HISTORY_KIND.MOVE_OVERLAY);
  assert.equal(redoResult.state.session.mode, MACHINE_MODE.TRACE);
  assert.deepEqual(redoResult.state.session.placement, MOVED_PLACEMENT);
});

test("redoing a loaded image restores the authored image-load context, not a later pure mode switch", () => {
  const host = createLoadedHost();
  host.selectMode(MACHINE_MODE.TRACE);

  const undoResult = host.activateUndo();
  assert.equal(undoResult.consumedHistoryRecord.kind, MACHINE_HISTORY_KIND.LOAD_IMAGE);
  assert.equal(undoResult.state.session.image, null);
  assert.equal(undoResult.state.session.mode, MACHINE_MODE.TRACE);

  const redoResult = host.activateRedo();
  assert.equal(redoResult.consumedHistoryRecord.kind, MACHINE_HISTORY_KIND.LOAD_IMAGE);
  assert.deepEqual(redoResult.state.session.image, NORMALIZED_IMAGE);
  assert.equal(redoResult.state.session.mode, MACHINE_MODE.ALIGN);
});

test("clear-image undo restores the image context and redo returns to native Trace", () => {
  const host = createLoadedHost();
  host.selectMode(MACHINE_MODE.TRACE);
  host.clearImage();

  assert.equal(state(host).session.image, null);
  assert.equal(state(host).session.mode, MACHINE_MODE.TRACE);

  const undoResult = host.activateUndo();
  assert.equal(undoResult.consumedHistoryRecord.kind, MACHINE_HISTORY_KIND.CLEAR_IMAGE);
  assert.deepEqual(undoResult.state.session.image, NORMALIZED_IMAGE);
  assert.equal(undoResult.state.session.mode, MACHINE_MODE.TRACE);

  const redoResult = host.activateRedo();
  assert.equal(redoResult.consumedHistoryRecord.kind, MACHINE_HISTORY_KIND.CLEAR_IMAGE);
  assert.equal(redoResult.state.session.image, null);
  assert.equal(redoResult.state.session.mode, MACHINE_MODE.TRACE);
});

test("new semantic edits clear redo, but pure mode switches do not", () => {
  const host = createLoadedHost();
  addPin(host);

  host.activateUndo();
  assert.equal(state(host).history.future.length, 1);

  host.selectMode(MACHINE_MODE.TRACE);
  assert.equal(state(host).history.future.length, 1);
  host.selectMode(MACHINE_MODE.ALIGN);
  assert.equal(state(host).history.future.length, 1);

  applyPlacement(host, {
    placement: MOVED_PLACEMENT,
  });
  assert.equal(state(host).history.future.length, 0);
  assert.equal(state(host).history.past.at(-1).kind, MACHINE_HISTORY_KIND.MOVE_OVERLAY);
});
