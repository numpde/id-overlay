import test from "node:test";
import assert from "node:assert/strict";

import {
  MACHINE_EVENT_KIND,
  MACHINE_HISTORY_KIND,
  MACHINE_MODE,
  MACHINE_PANEL_INTENT,
  MACHINE_PLACEMENT_EDIT_KIND,
  createInitialMachineState,
  selectOverlayPolicy,
  selectPanelView,
  selectIsCurrentPanelRequest,
  selectStatus,
  transitionMachine,
} from "../../src/core/machine/index.js";

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
  ty: 10,
});

test("initial no-image state is native Trace with paste as the primary action", () => {
  const state = createInitialMachineState();

  assert.equal(state.session.mode, MACHINE_MODE.TRACE);
  assert.equal(state.session.image, null);
  assert.equal(selectStatus(state), "Paste an image to begin.");
  assert.deepEqual(selectOverlayPolicy(state), {
    hasImage: false,
    mode: MACHINE_MODE.TRACE,
    isPassThrough: true,
    canEditOverlay: false,
    arePinsVisible: false,
  });
  assert.equal(selectPanelView(state).mainAction, "paste");
  assert.equal(selectPanelView(state).isAlignEnabled, false);
});

test("loading an image enters Align and records a user-facing reloadable edit", () => {
  const result = transitionMachine(createInitialMachineState(), {
    type: MACHINE_EVENT_KIND.LOAD_IMAGE,
    image: IMAGE,
    placement: PLACEMENT,
  });

  assert.equal(result.state.session.mode, MACHINE_MODE.ALIGN);
  assert.equal(result.state.session.image, IMAGE);
  assert.equal(result.state.session.placement, PLACEMENT);
  assert.equal(result.historyRecord.kind, MACHINE_HISTORY_KIND.LOAD_IMAGE);
  assert.equal(selectPanelView(result.state).undoTooltip, "Clear image");
  assert.equal(result.state.history.future.length, 0);
  assert.equal(result.state.history.past.length, 1);
});

test("pure mode switches are not history and do not clear redo", () => {
  let state = loadImage();
  state = addPin(state).state;

  let result = transitionMachine(state, { type: MACHINE_EVENT_KIND.UNDO });
  assert.equal(result.state.history.future.length, 1);
  assert.equal(selectPanelView(result.state).redoTooltip, "Add pin");

  result = transitionMachine(result.state, {
    type: MACHINE_EVENT_KIND.SELECT_MODE,
    mode: MACHINE_MODE.TRACE,
  });

  assert.equal(result.state.session.mode, MACHINE_MODE.TRACE);
  assert.equal(result.state.history.future.length, 1);
  assert.equal(result.historyRecord, null);
  assert.equal(selectPanelView(result.state).redoTooltip, "Add pin");
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
  assert.equal(selectPanelView(fit.state).undoTooltip, "Undo fit overlay");

  const undo = transitionMachine(fit.state, { type: MACHINE_EVENT_KIND.UNDO });
  assert.equal(undo.state.session.mode, MACHINE_MODE.ALIGN);
  assert.equal(undo.state.session.registration.dirty, true);
  assert.equal(undo.state.session.registration.solvedTransform, null);

  const redo = transitionMachine(undo.state, { type: MACHINE_EVENT_KIND.REDO });
  assert.equal(redo.state.session.mode, MACHINE_MODE.TRACE);
  assert.equal(redo.state.session.registration.dirty, false);
  assert.ok(redo.state.session.registration.solvedTransform);
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
});

test("pin undo and redo land in Align because pins are the visible editable object", () => {
  let state = loadImage();
  state = addPin(state).state;
  state = transitionMachine(state, {
    type: MACHINE_EVENT_KIND.SELECT_MODE,
    mode: MACHINE_MODE.TRACE,
  }).state;

  const undo = transitionMachine(state, { type: MACHINE_EVENT_KIND.UNDO });
  assert.equal(undo.state.session.mode, MACHINE_MODE.ALIGN);
  assert.equal(undo.state.session.registration.pins.length, 0);

  const redo = transitionMachine(undo.state, { type: MACHINE_EVENT_KIND.REDO });
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
  assert.equal(undo.state.session.mode, MACHINE_MODE.ALIGN);
  assert.equal(undo.state.session.registration.pins.length, 2);

  const redo = transitionMachine(undo.state, { type: MACHINE_EVENT_KIND.REDO });
  assert.equal(redo.state.session.mode, MACHINE_MODE.ALIGN);
  assert.equal(redo.state.session.registration.pins.length, 0);
});

test("placement undo and redo preserve the user's current mode", () => {
  let state = loadImage();
  state = transitionMachine(state, {
    type: MACHINE_EVENT_KIND.SET_PLACEMENT,
    placement: MOVED_PLACEMENT,
    editKind: MACHINE_PLACEMENT_EDIT_KIND.MOVE,
  }).state;
  state = transitionMachine(state, {
    type: MACHINE_EVENT_KIND.SELECT_MODE,
    mode: MACHINE_MODE.TRACE,
  }).state;

  const undo = transitionMachine(state, { type: MACHINE_EVENT_KIND.UNDO });
  assert.equal(undo.state.session.mode, MACHINE_MODE.TRACE);
  assert.equal(undo.state.session.placement, PLACEMENT);

  const redo = transitionMachine(undo.state, { type: MACHINE_EVENT_KIND.REDO });
  assert.equal(redo.state.session.mode, MACHINE_MODE.TRACE);
  assert.equal(redo.state.session.placement, MOVED_PLACEMENT);
});

test("placement undo can restore an explicitly empty previous placement", () => {
  let state = transitionMachine(createInitialMachineState(), {
    type: MACHINE_EVENT_KIND.LOAD_IMAGE,
    image: IMAGE,
    placement: null,
  }).state;

  state = transitionMachine(state, {
    type: MACHINE_EVENT_KIND.SET_PLACEMENT,
    placement: MOVED_PLACEMENT,
    editKind: MACHINE_PLACEMENT_EDIT_KIND.MOVE,
  }).state;

  const undo = transitionMachine(state, { type: MACHINE_EVENT_KIND.UNDO });
  assert.equal(undo.state.session.placement, null);
  assert.equal(undo.consumedHistoryRecord.kind, MACHINE_HISTORY_KIND.MOVE_OVERLAY);
});

test("placement history distinguishes move rotate and scale without tracking opacity", () => {
  let state = loadImage();

  const rotate = transitionMachine(state, {
    type: MACHINE_EVENT_KIND.SET_PLACEMENT,
    placement: { ...PLACEMENT, b: 0.5, rotationRad: 0.5 },
    editKind: MACHINE_PLACEMENT_EDIT_KIND.ROTATE,
  });
  assert.equal(rotate.historyRecord.kind, MACHINE_HISTORY_KIND.ROTATE_OVERLAY);
  assert.equal(rotate.historyRecord.undoLabel, "Undo rotate overlay");

  const scale = transitionMachine(rotate.state, {
    type: MACHINE_EVENT_KIND.SET_PLACEMENT,
    placement: { ...PLACEMENT, a: 2, scale: 2 },
    editKind: MACHINE_PLACEMENT_EDIT_KIND.SCALE,
  });
  assert.equal(scale.historyRecord.kind, MACHINE_HISTORY_KIND.SCALE_OVERLAY);
  assert.equal(scale.historyRecord.undoLabel, "Undo scale overlay");
});

test("redoing a loaded image restores authored image-load context, not later mode switches", () => {
  let state = loadImage();
  state = transitionMachine(state, {
    type: MACHINE_EVENT_KIND.SELECT_MODE,
    mode: MACHINE_MODE.TRACE,
  }).state;

  const undo = transitionMachine(state, { type: MACHINE_EVENT_KIND.UNDO });
  assert.equal(undo.state.session.image, null);
  assert.equal(undo.state.session.mode, MACHINE_MODE.TRACE);
  assert.equal(selectPanelView(undo.state).redoTooltip, "Reload image");

  const redo = transitionMachine(undo.state, { type: MACHINE_EVENT_KIND.REDO });
  assert.equal(redo.state.session.image, IMAGE);
  assert.equal(redo.state.session.mode, MACHINE_MODE.ALIGN);
});

test("clear-image undo restores image context and redo returns to native Trace", () => {
  let state = loadImage();
  state = transitionMachine(state, {
    type: MACHINE_EVENT_KIND.SELECT_MODE,
    mode: MACHINE_MODE.TRACE,
  }).state;
  state = transitionMachine(state, { type: MACHINE_EVENT_KIND.CLEAR_IMAGE }).state;

  assert.equal(state.session.image, null);
  assert.equal(state.session.mode, MACHINE_MODE.TRACE);

  const undo = transitionMachine(state, { type: MACHINE_EVENT_KIND.UNDO });
  assert.equal(undo.state.session.image, IMAGE);
  assert.equal(undo.state.session.mode, MACHINE_MODE.TRACE);

  const redo = transitionMachine(undo.state, { type: MACHINE_EVENT_KIND.REDO });
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
    type: MACHINE_EVENT_KIND.SET_PLACEMENT,
    placement: MOVED_PLACEMENT,
    editKind: MACHINE_PLACEMENT_EDIT_KIND.MOVE,
  }).state;
  assert.equal(state.history.future.length, 0);
  assert.equal(state.history.past.at(-1).kind, MACHINE_HISTORY_KIND.MOVE_OVERLAY);
});

test("selectors derive panel intent, status, controls, and pass-through", () => {
  let state = loadImage();
  state = transitionMachine(state, {
    type: MACHINE_EVENT_KIND.REQUEST_PANEL_INTENT,
    intent: MACHINE_PANEL_INTENT.CLEAR_IMAGE_CONFIRM,
  }).state;

  assert.equal(selectPanelView(state).mainAction, "confirm-clear-image");
  assert.equal(selectIsCurrentPanelRequest(state, state.panel.requestId), true);
  assert.equal(selectIsCurrentPanelRequest(state, state.panel.requestId + 1), false);
  assert.equal(selectIsCurrentPanelRequest(createInitialMachineState(), null), false);
  assert.equal(selectStatus(state), "Confirm clearing the image.");
  assert.deepEqual(selectOverlayPolicy(state), {
    hasImage: true,
    mode: MACHINE_MODE.ALIGN,
    isPassThrough: false,
    canEditOverlay: true,
    arePinsVisible: true,
  });

  state = transitionMachine(state, {
    type: MACHINE_EVENT_KIND.SELECT_MODE,
    mode: MACHINE_MODE.TRACE,
  }).state;
  assert.equal(selectPanelView(state).canClearPins, false);
  assert.equal(selectOverlayPolicy(state).isPassThrough, true);
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
