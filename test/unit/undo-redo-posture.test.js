import test from "node:test";
import assert from "node:assert/strict";

import {
  MACHINE_EVENT_KIND,
  MACHINE_HISTORY_KIND,
  MACHINE_MODE,
  MACHINE_PLACEMENT_EDIT_KIND,
  createInitialMachineState,
  selectPanelView,
  transitionMachine,
} from "../../src/core/machine/index.js";
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
  let state = loadImage();
  state = addPin(state).state;

  let result = transitionMachine(state, { type: MACHINE_EVENT_KIND.UNDO });
  assert.equal(result.consumedHistoryRecord.kind, MACHINE_HISTORY_KIND.ADD_PIN);
  assert.equal(selectPanelView(result.state).historyControls.redo.title, "Add pin");

  result = transitionMachine(result.state, {
    type: MACHINE_EVENT_KIND.SELECT_MODE,
    mode: MACHINE_MODE.TRACE,
  });

  assert.equal(result.state.session.mode, MACHINE_MODE.TRACE);
  assert.equal(result.state.history.future.length, 1);
  assert.equal(selectPanelView(result.state).historyControls.redo.title, "Add pin");
});

test("Trace switch with dirty computable pins is an undoable fit transition", () => {
  let state = loadImage();
  state = addTwoPins(state);

  const fit = transitionMachine(state, {
    type: MACHINE_EVENT_KIND.SELECT_MODE,
    mode: MACHINE_MODE.TRACE,
  });

  assert.equal(fit.state.session.mode, MACHINE_MODE.TRACE);
  assert.equal(fit.state.session.registration.dirty, false);
  assert.ok(fit.state.session.registration.solvedTransform);
  assert.equal(fit.historyRecord.kind, MACHINE_HISTORY_KIND.FIT_OVERLAY);
  assert.equal(selectPanelView(fit.state).historyControls.undo.title, "Undo fit overlay");

  const undo = transitionMachine(fit.state, { type: MACHINE_EVENT_KIND.UNDO });
  assert.equal(undo.consumedHistoryRecord.kind, MACHINE_HISTORY_KIND.FIT_OVERLAY);
  assert.equal(undo.state.session.mode, MACHINE_MODE.ALIGN);
  assert.equal(undo.state.session.registration.dirty, true);
  assert.equal(undo.state.session.registration.solvedTransform, null);
  assert.equal(undo.state.session.registration.pins.length, 2);

  const redo = transitionMachine(undo.state, { type: MACHINE_EVENT_KIND.REDO });
  assert.equal(redo.consumedHistoryRecord.kind, MACHINE_HISTORY_KIND.FIT_OVERLAY);
  assert.equal(redo.state.session.mode, MACHINE_MODE.TRACE);
  assert.equal(redo.state.session.registration.dirty, false);
  assert.ok(redo.state.session.registration.solvedTransform);
  assert.equal(redo.state.session.registration.pins.length, 2);
});

test("Trace switch with ready unsolved pins is still an undoable fit transition", () => {
  const state = createInitialMachineState({
    session: {
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

  const fit = transitionMachine(state, {
    type: MACHINE_EVENT_KIND.SELECT_MODE,
    mode: MACHINE_MODE.TRACE,
  });

  assert.equal(fit.state.session.mode, MACHINE_MODE.TRACE);
  assert.ok(fit.state.session.registration.solvedTransform);
  assert.equal(fit.historyRecord.kind, MACHINE_HISTORY_KIND.FIT_OVERLAY);

  const undo = transitionMachine(fit.state, { type: MACHINE_EVENT_KIND.UNDO });
  assert.equal(undo.state.session.mode, MACHINE_MODE.ALIGN);
  assert.equal(undo.state.session.registration.solvedTransform, null);
  assert.equal(undo.state.session.registration.dirty, false);
});

test("pin undo and redo land in Align because pins are the visible editable object", () => {
  let state = loadImage();
  state = addPin(state).state;
  state = transitionMachine(state, {
    type: MACHINE_EVENT_KIND.SELECT_MODE,
    mode: MACHINE_MODE.TRACE,
  }).state;

  const undo = transitionMachine(state, { type: MACHINE_EVENT_KIND.UNDO });
  assert.equal(undo.consumedHistoryRecord.kind, MACHINE_HISTORY_KIND.ADD_PIN);
  assert.equal(undo.state.session.mode, MACHINE_MODE.ALIGN);
  assert.equal(undo.state.session.registration.pins.length, 0);

  const redo = transitionMachine(undo.state, { type: MACHINE_EVENT_KIND.REDO });
  assert.equal(redo.consumedHistoryRecord.kind, MACHINE_HISTORY_KIND.ADD_PIN);
  assert.equal(redo.state.session.mode, MACHINE_MODE.ALIGN);
  assert.equal(redo.state.session.registration.pins.length, 1);
});

test("clear-pins undo and redo land in Align because pin state is invisible in Trace", () => {
  let state = loadImage();
  state = addTwoPins(state);
  state = transitionMachine(state, { type: MACHINE_EVENT_KIND.CLEAR_PINS }).state;
  state = transitionMachine(state, {
    type: MACHINE_EVENT_KIND.SELECT_MODE,
    mode: MACHINE_MODE.TRACE,
  }).state;

  const undo = transitionMachine(state, { type: MACHINE_EVENT_KIND.UNDO });
  assert.equal(undo.consumedHistoryRecord.kind, MACHINE_HISTORY_KIND.CLEAR_PINS);
  assert.equal(undo.state.session.mode, MACHINE_MODE.ALIGN);
  assert.equal(undo.state.session.registration.pins.length, 2);

  const redo = transitionMachine(undo.state, { type: MACHINE_EVENT_KIND.REDO });
  assert.equal(redo.consumedHistoryRecord.kind, MACHINE_HISTORY_KIND.CLEAR_PINS);
  assert.equal(redo.state.session.mode, MACHINE_MODE.ALIGN);
  assert.equal(redo.state.session.registration.pins.length, 0);
});

test("placement undo and redo preserve the user's current mode", () => {
  let state = loadImage();
  state = transitionMachine(state, {
    type: MACHINE_EVENT_KIND.APPLY_PLACEMENT_EDIT,
    renderedPlacement: PLACEMENT,
    placement: MOVED_PLACEMENT,
    editKind: MACHINE_PLACEMENT_EDIT_KIND.MOVE,
  }).state;
  state = transitionMachine(state, {
    type: MACHINE_EVENT_KIND.SELECT_MODE,
    mode: MACHINE_MODE.TRACE,
  }).state;

  const undo = transitionMachine(state, { type: MACHINE_EVENT_KIND.UNDO });
  assert.equal(undo.consumedHistoryRecord.kind, MACHINE_HISTORY_KIND.MOVE_OVERLAY);
  assert.equal(undo.state.session.mode, MACHINE_MODE.TRACE);
  assert.deepEqual(undo.state.session.placement, PLACEMENT);

  const redo = transitionMachine(undo.state, { type: MACHINE_EVENT_KIND.REDO });
  assert.equal(redo.consumedHistoryRecord.kind, MACHINE_HISTORY_KIND.MOVE_OVERLAY);
  assert.equal(redo.state.session.mode, MACHINE_MODE.TRACE);
  assert.deepEqual(redo.state.session.placement, MOVED_PLACEMENT);
});

test("redoing a loaded image restores the authored image-load context, not a later pure mode switch", () => {
  let state = loadImage();
  state = transitionMachine(state, {
    type: MACHINE_EVENT_KIND.SELECT_MODE,
    mode: MACHINE_MODE.TRACE,
  }).state;

  const undo = transitionMachine(state, { type: MACHINE_EVENT_KIND.UNDO });
  assert.equal(undo.consumedHistoryRecord.kind, MACHINE_HISTORY_KIND.LOAD_IMAGE);
  assert.equal(undo.state.session.image, null);
  assert.equal(undo.state.session.mode, MACHINE_MODE.TRACE);

  const redo = transitionMachine(undo.state, { type: MACHINE_EVENT_KIND.REDO });
  assert.equal(redo.consumedHistoryRecord.kind, MACHINE_HISTORY_KIND.LOAD_IMAGE);
  assert.deepEqual(redo.state.session.image, NORMALIZED_IMAGE);
  assert.equal(redo.state.session.mode, MACHINE_MODE.ALIGN);
});

test("clear-image undo restores the image context and redo returns to native Trace", () => {
  let state = loadImage();
  state = transitionMachine(state, {
    type: MACHINE_EVENT_KIND.SELECT_MODE,
    mode: MACHINE_MODE.TRACE,
  }).state;
  state = transitionMachine(state, { type: MACHINE_EVENT_KIND.CLEAR_IMAGE }).state;

  assert.equal(state.session.image, null);
  assert.equal(state.session.mode, MACHINE_MODE.TRACE);

  const undo = transitionMachine(state, { type: MACHINE_EVENT_KIND.UNDO });
  assert.equal(undo.consumedHistoryRecord.kind, MACHINE_HISTORY_KIND.CLEAR_IMAGE);
  assert.deepEqual(undo.state.session.image, NORMALIZED_IMAGE);
  assert.equal(undo.state.session.mode, MACHINE_MODE.TRACE);

  const redo = transitionMachine(undo.state, { type: MACHINE_EVENT_KIND.REDO });
  assert.equal(redo.consumedHistoryRecord.kind, MACHINE_HISTORY_KIND.CLEAR_IMAGE);
  assert.equal(redo.state.session.image, null);
  assert.equal(redo.state.session.mode, MACHINE_MODE.TRACE);
});

test("new semantic edits clear redo, but pure mode switches do not", () => {
  let state = loadImage();
  state = addPin(state).state;

  state = transitionMachine(state, { type: MACHINE_EVENT_KIND.UNDO }).state;
  assert.equal(state.history.future.length, 1);

  state = transitionMachine(state, {
    type: MACHINE_EVENT_KIND.SELECT_MODE,
    mode: MACHINE_MODE.TRACE,
  }).state;
  assert.equal(state.history.future.length, 1);
  state = transitionMachine(state, {
    type: MACHINE_EVENT_KIND.SELECT_MODE,
    mode: MACHINE_MODE.ALIGN,
  }).state;
  assert.equal(state.history.future.length, 1);

  state = transitionMachine(state, {
    type: MACHINE_EVENT_KIND.APPLY_PLACEMENT_EDIT,
    renderedPlacement: PLACEMENT,
    placement: MOVED_PLACEMENT,
    editKind: MACHINE_PLACEMENT_EDIT_KIND.MOVE,
  }).state;
  assert.equal(state.history.future.length, 0);
  assert.equal(state.history.past.at(-1).kind, MACHINE_HISTORY_KIND.MOVE_OVERLAY);
});

function loadImage() {
  return transitionMachine(createInitialMachineState(), {
    type: MACHINE_EVENT_KIND.LOAD_IMAGE,
    image: IMAGE,
    placement: PLACEMENT,
  }).state;
}

function addPin(state) {
  return transitionMachine(state, {
    type: MACHINE_EVENT_KIND.ADD_PIN,
    imagePx: { x: 400, y: 200 },
    mapLatLon: { lat: -1.23, lon: 36.84 },
  });
}

function addTwoPins(state) {
  state = transitionMachine(state, {
    type: MACHINE_EVENT_KIND.ADD_PIN,
    id: 1,
    imagePx: { x: 400, y: 200 },
    mapLatLon: { lat: -1.23, lon: 36.84 },
  }).state;
  return transitionMachine(state, {
    type: MACHINE_EVENT_KIND.ADD_PIN,
    id: 2,
    imagePx: { x: 600, y: 200 },
    mapLatLon: { lat: -1.23, lon: 38.84 },
  }).state;
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
