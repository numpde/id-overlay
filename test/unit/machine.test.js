import test from "node:test";
import assert from "node:assert/strict";

import {
  MACHINE_EVENT_KIND,
  MACHINE_HISTORY_KIND,
  MACHINE_MODE,
  MACHINE_PANEL_INTENT,
  MACHINE_PLACEMENT_EDIT_KIND,
  MACHINE_STATUS_NOTICE_KIND,
} from "../../src/core/machine/events.js";
import {
  selectOverlayPolicy,
} from "../../src/core/machine/policy.js";
import {
  selectOverlayPresentation,
  selectPanelStatusText,
} from "../../src/core/machine/selectors.js";
import {
  selectPanelView,
} from "../../src/content/panel-view-model.js";
import { createInitialMachineState } from "../../src/core/machine/state.js";
import { transitionMachine } from "../../src/core/machine/transition.js";
import { normalizeSessionImage } from "../../src/core/session.js";

// TODO(smell): This suite tests machine behavior mostly by dispatching raw
// mutation/replay events. Split it into public user/fact ingress tests and
// private domain-transition tests when the flat event vocabulary is replaced.
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

test("initial no-image state is native Trace with paste as the primary action", () => {
  const state = createInitialMachineState();

  assert.equal(state.session.mode, MACHINE_MODE.TRACE);
  assert.equal(state.session.image, null);
  assert.equal(selectPanelStatusText(state), "Paste a screenshot to begin.");
  assert.deepEqual(selectOverlayPolicy(state), {
    hasImage: false,
    mode: MACHINE_MODE.TRACE,
    isNativeMapInput: true,
    isPassThrough: true,
    canEditOverlay: false,
    arePinsVisible: false,
    ownsPointerHitTesting: false,
  });
  assert.deepEqual(selectOverlayPresentation(state), {
    mode: MACHINE_MODE.TRACE,
    isPassThrough: true,
    arePinsVisible: false,
    ownsPointerHitTesting: false,
  });
  assert.equal(selectPanelView(state).mainAction.kind, "paste");
  assert.equal(selectPanelView(state).modeSwitch.disabled, true);
});

test("loading an image enters Align and records a user-facing reloadable edit", () => {
  const result = transitionMachine(createInitialMachineState(), {
    type: MACHINE_EVENT_KIND.LOAD_IMAGE,
    image: IMAGE,
    placement: PLACEMENT,
  });

  assert.equal(result.state.session.mode, MACHINE_MODE.ALIGN);
  assert.deepEqual(result.state.session.image, NORMALIZED_IMAGE);
  assert.deepEqual(result.state.session.placement, PLACEMENT);
  assert.equal(result.historyRecord.kind, MACHINE_HISTORY_KIND.LOAD_IMAGE);
  assert.equal(result.state.status.notice.kind, MACHINE_STATUS_NOTICE_KIND.IMAGE_LOADED);
  assert.equal(selectPanelStatusText(result.state), "Loaded screenshot 800×400.");
  assert.equal(selectPanelView(result.state).historyControls.undo.title, "Remove image");
  assert.equal(result.state.history.future.length, 0);
  assert.equal(result.state.history.past.length, 1);
});

test("pure mode switches are not history and do not clear redo", () => {
  let state = loadImage();
  state = addPin(state).state;

  let result = transitionMachine(state, { type: MACHINE_EVENT_KIND.UNDO });
  assert.equal(result.state.history.future.length, 1);
  assert.equal(selectPanelView(result.state).historyControls.redo.title, "Add pin");

  result = transitionMachine(result.state, {
    type: MACHINE_EVENT_KIND.SELECT_MODE,
    mode: MACHINE_MODE.TRACE,
  });

  assert.equal(result.state.session.mode, MACHINE_MODE.TRACE);
  assert.equal(result.state.history.future.length, 1);
  assert.equal(result.historyRecord, null);
  assert.equal(selectPanelView(result.state).historyControls.redo.title, "Add pin");
});

test("invalid mode selection is a pure no-op", () => {
  const state = loadImage();

  const result = transitionMachine(state, {
    type: MACHINE_EVENT_KIND.SELECT_MODE,
    mode: "invalid",
  });

  assert.deepEqual(result.state, state);
  assert.deepEqual(result.effects, []);
  assert.equal(result.historyRecord, null);
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

test("pin toggle is a machine-owned semantic transition over adapter facts", () => {
  let state = loadImage();

  const add = transitionMachine(state, {
    type: MACHINE_EVENT_KIND.TOGGLE_PIN,
    imagePx: { x: 400, y: 200 },
    mapLatLon: { lat: -1.23, lon: 36.84 },
  });

  assert.equal(add.state.status.notice.kind, MACHINE_STATUS_NOTICE_KIND.PIN_ADDED);
  assert.equal(add.state.session.registration.pins.length, 1);
  assert.equal(add.historyRecord.kind, MACHINE_HISTORY_KIND.ADD_PIN);

  state = add.state;
  const remove = transitionMachine(state, {
    type: MACHINE_EVENT_KIND.TOGGLE_PIN,
    existingPinId: 1,
    imagePx: { x: 400, y: 200 },
    mapLatLon: { lat: -1.23, lon: 36.84 },
  });

  assert.equal(remove.state.status.notice.kind, MACHINE_STATUS_NOTICE_KIND.PIN_REMOVED);
  assert.equal(remove.state.session.registration.pins.length, 0);
  assert.equal(remove.historyRecord.kind, MACHINE_HISTORY_KIND.REMOVE_PIN);
});

test("pin toggle is invalid outside visible Align editing", () => {
  let state = loadImage();
  state = transitionMachine(state, {
    type: MACHINE_EVENT_KIND.SELECT_MODE,
    mode: MACHINE_MODE.TRACE,
  }).state;

  const result = transitionMachine(state, {
    type: MACHINE_EVENT_KIND.TOGGLE_PIN,
    imagePx: { x: 400, y: 200 },
    mapLatLon: { lat: -1.23, lon: 36.84 },
  });

  assert.deepEqual(result.state, state);
  assert.equal(result.historyRecord, null);
});

test("registration edits can preserve adapter-derived visible placement", () => {
  let state = addTwoPins(loadImage());
  state = transitionMachine(state, {
    type: MACHINE_EVENT_KIND.FIT_OVERLAY,
  }).state;
  state = transitionMachine(state, {
    type: MACHINE_EVENT_KIND.SELECT_MODE,
    mode: MACHINE_MODE.ALIGN,
  }).state;

  const result = transitionMachine(state, {
    type: MACHINE_EVENT_KIND.TOGGLE_PIN,
    imagePx: { x: 300, y: 150 },
    mapLatLon: { lat: -1.1, lon: 37.1 },
    preservedPlacement: MOVED_PLACEMENT,
  });

  assert.deepEqual(result.state.session.placement, MOVED_PLACEMENT);
  assert.equal(result.state.session.registration.pins.length, 3);
  assert.equal(result.state.session.registration.dirty, true);
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

test("clear-pins is invalid in Trace because pins are not visible there", () => {
  let state = addPin(loadImage()).state;
  state = transitionMachine(state, {
    type: MACHINE_EVENT_KIND.SELECT_MODE,
    mode: MACHINE_MODE.TRACE,
  }).state;

  const result = transitionMachine(state, { type: MACHINE_EVENT_KIND.CLEAR_PINS });

  assert.deepEqual(result.state, state);
  assert.equal(result.historyRecord, null);
});

test("semantic status notices describe the concrete visible edit", () => {
  let state = loadImage();

  const add = addPin(state);
  assert.equal(selectPanelStatusText(add.state), "Added pin 1.");

  const remove = transitionMachine(add.state, {
    type: MACHINE_EVENT_KIND.REMOVE_PIN,
    id: 1,
  });
  assert.equal(selectPanelStatusText(remove.state), "Removed pin 1.");

  state = addTwoPins(loadImage());
  const clear = transitionMachine(state, { type: MACHINE_EVENT_KIND.CLEAR_PINS });
  assert.equal(selectPanelStatusText(clear.state), "Cleared 2 pins.");

  state = addTwoPins(loadImage());
  const fit = transitionMachine(state, {
    type: MACHINE_EVENT_KIND.SELECT_MODE,
    mode: MACHINE_MODE.TRACE,
  });
  assert.equal(selectPanelStatusText(fit.state), "Fit overlay from 2 pins.");
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
  assert.equal(undo.state.session.mode, MACHINE_MODE.TRACE);
  assert.deepEqual(undo.state.session.placement, PLACEMENT);

  const redo = transitionMachine(undo.state, { type: MACHINE_EVENT_KIND.REDO });
  assert.equal(redo.state.session.mode, MACHINE_MODE.TRACE);
  assert.deepEqual(redo.state.session.placement, MOVED_PLACEMENT);
});

test("placement history replay can restore an explicitly empty placement", () => {
  const state = transitionMachine(createInitialMachineState(), {
    type: MACHINE_EVENT_KIND.LOAD_IMAGE,
    image: IMAGE,
    placement: MOVED_PLACEMENT,
  }).state;

  const result = transitionMachine(state, {
    type: MACHINE_EVENT_KIND.RESTORE_PLACEMENT,
    placement: null,
  });
  assert.equal(result.state.session.placement, null);
  assert.equal(result.historyRecord, null);
});

test("placement history distinguishes move rotate and scale without tracking opacity", () => {
  let state = loadImage();

  const rotate = transitionMachine(state, {
    type: MACHINE_EVENT_KIND.APPLY_PLACEMENT_EDIT,
    renderedPlacement: PLACEMENT,
    placement: { ...PLACEMENT, b: 0.5, rotationRad: 0.5 },
    editKind: MACHINE_PLACEMENT_EDIT_KIND.ROTATE,
  });
  assert.equal(rotate.historyRecord.kind, MACHINE_HISTORY_KIND.ROTATE_OVERLAY);
  assert.equal(rotate.historyRecord.undoLabel, "Undo rotate overlay");

  const scale = transitionMachine(rotate.state, {
    type: MACHINE_EVENT_KIND.APPLY_PLACEMENT_EDIT,
    renderedPlacement: rotate.state.session.placement,
    placement: { ...PLACEMENT, a: 2, scale: 2 },
    editKind: MACHINE_PLACEMENT_EDIT_KIND.SCALE,
  });
  assert.equal(scale.historyRecord.kind, MACHINE_HISTORY_KIND.SCALE_OVERLAY);
  assert.equal(scale.historyRecord.undoLabel, "Undo scale overlay");
});

test("placement edit preview is transient machine runtime, not durable session state", () => {
  let state = loadImage();

  const begin = transitionMachine(state, {
    type: MACHINE_EVENT_KIND.BEGIN_PLACEMENT_EDIT,
    editKind: MACHINE_PLACEMENT_EDIT_KIND.MOVE,
    renderedPlacement: PLACEMENT,
  });
  assert.equal(begin.historyRecord, null);
  assert.deepEqual(begin.state.session.placement, PLACEMENT);
  assert.deepEqual(begin.state.runtime.placementEdit.beforePlacement, PLACEMENT);
  assert.deepEqual(begin.state.runtime.placementEdit.previewPlacement, PLACEMENT);

  const preview = transitionMachine(begin.state, {
    type: MACHINE_EVENT_KIND.PREVIEW_PLACEMENT_EDIT,
    placement: MOVED_PLACEMENT,
  });
  assert.equal(preview.historyRecord, null);
  assert.deepEqual(preview.state.session.placement, PLACEMENT);
  assert.deepEqual(preview.state.runtime.placementEdit.previewPlacement, MOVED_PLACEMENT);
  assert.equal(preview.state.history.past.length, state.history.past.length);
});

test("placement edit commit records one semantic history entry and clears the preview", () => {
  let state = loadImage();
  state = transitionMachine(state, {
    type: MACHINE_EVENT_KIND.BEGIN_PLACEMENT_EDIT,
    editKind: MACHINE_PLACEMENT_EDIT_KIND.MOVE,
    renderedPlacement: PLACEMENT,
  }).state;
  state = transitionMachine(state, {
    type: MACHINE_EVENT_KIND.PREVIEW_PLACEMENT_EDIT,
    placement: MOVED_PLACEMENT,
  }).state;

  const commit = transitionMachine(state, {
    type: MACHINE_EVENT_KIND.COMMIT_PLACEMENT_EDIT,
  });

  assert.deepEqual(commit.state.session.placement, MOVED_PLACEMENT);
  assert.equal(commit.state.runtime.placementEdit, null);
  assert.equal(commit.historyRecord.kind, MACHINE_HISTORY_KIND.MOVE_OVERLAY);
  assert.equal(commit.state.history.past.at(-1).kind, MACHINE_HISTORY_KIND.MOVE_OVERLAY);

  const undo = transitionMachine(commit.state, { type: MACHINE_EVENT_KIND.UNDO });
  assert.deepEqual(undo.state.session.placement, PLACEMENT);
  assert.equal(undo.state.runtime.placementEdit, null);

  const redo = transitionMachine(undo.state, { type: MACHINE_EVENT_KIND.REDO });
  assert.deepEqual(redo.state.session.placement, MOVED_PLACEMENT);
  assert.equal(redo.state.runtime.placementEdit, null);
});

test("unchanged placement edit commit only clears transient runtime", () => {
  let state = loadImage();
  state = transitionMachine(state, {
    type: MACHINE_EVENT_KIND.BEGIN_PLACEMENT_EDIT,
    editKind: MACHINE_PLACEMENT_EDIT_KIND.MOVE,
    renderedPlacement: PLACEMENT,
  }).state;

  const commit = transitionMachine(state, {
    type: MACHINE_EVENT_KIND.COMMIT_PLACEMENT_EDIT,
  });

  assert.deepEqual(commit.state.session.placement, PLACEMENT);
  assert.equal(commit.state.runtime.placementEdit, null);
  assert.equal(commit.historyRecord, null);
});

test("cancelled placement edit drops preview without changing session", () => {
  let state = loadImage();
  state = transitionMachine(state, {
    type: MACHINE_EVENT_KIND.BEGIN_PLACEMENT_EDIT,
    editKind: MACHINE_PLACEMENT_EDIT_KIND.MOVE,
    renderedPlacement: PLACEMENT,
  }).state;
  state = transitionMachine(state, {
    type: MACHINE_EVENT_KIND.PREVIEW_PLACEMENT_EDIT,
    placement: MOVED_PLACEMENT,
  }).state;

  const cancel = transitionMachine(state, {
    type: MACHINE_EVENT_KIND.CANCEL_PLACEMENT_EDIT,
  });

  assert.deepEqual(cancel.state.session.placement, PLACEMENT);
  assert.equal(cancel.state.runtime.placementEdit, null);
  assert.equal(cancel.historyRecord, null);
});

test("one-shot placement edits are undoable user-visible rotate and scale actions", () => {
  let state = loadImage();
  const rotatedPlacement = { ...PLACEMENT, a: 0.5, b: 0.5, rotationRad: Math.PI / 4 };
  const rotate = transitionMachine(state, {
    type: MACHINE_EVENT_KIND.APPLY_PLACEMENT_EDIT,
    editKind: MACHINE_PLACEMENT_EDIT_KIND.ROTATE,
    renderedPlacement: PLACEMENT,
    placement: rotatedPlacement,
  });

  assert.deepEqual(rotate.state.session.placement, rotatedPlacement);
  assert.equal(rotate.state.runtime.placementEdit, null);
  assert.equal(rotate.historyRecord.kind, MACHINE_HISTORY_KIND.ROTATE_OVERLAY);

  state = rotate.state;
  const scaledPlacement = { ...rotatedPlacement, a: 2, b: 0, scale: 2, rotationRad: 0 };
  const scale = transitionMachine(state, {
    type: MACHINE_EVENT_KIND.APPLY_PLACEMENT_EDIT,
    editKind: MACHINE_PLACEMENT_EDIT_KIND.SCALE,
    renderedPlacement: rotatedPlacement,
    placement: scaledPlacement,
  });

  assert.deepEqual(scale.state.session.placement, scaledPlacement);
  assert.equal(scale.historyRecord.kind, MACHINE_HISTORY_KIND.SCALE_OVERLAY);
});

test("placement edit lifecycle is invalid outside Align overlay editing", () => {
  let state = createInitialMachineState();
  let result = transitionMachine(state, {
    type: MACHINE_EVENT_KIND.BEGIN_PLACEMENT_EDIT,
    editKind: MACHINE_PLACEMENT_EDIT_KIND.MOVE,
    renderedPlacement: PLACEMENT,
  });
  assert.deepEqual(result.state, state);

  state = loadImage();
  state = transitionMachine(state, {
    type: MACHINE_EVENT_KIND.SELECT_MODE,
    mode: MACHINE_MODE.TRACE,
  }).state;
  result = transitionMachine(state, {
    type: MACHINE_EVENT_KIND.APPLY_PLACEMENT_EDIT,
    editKind: MACHINE_PLACEMENT_EDIT_KIND.SCALE,
    renderedPlacement: PLACEMENT,
    placement: MOVED_PLACEMENT,
  });

  assert.deepEqual(result.state, state);
  assert.equal(result.historyRecord, null);
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
  assert.equal(selectPanelView(undo.state).historyControls.redo.title, "Reload image");

  const redo = transitionMachine(undo.state, { type: MACHINE_EVENT_KIND.REDO });
  assert.deepEqual(redo.state.session.image, NORMALIZED_IMAGE);
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
  assert.deepEqual(undo.state.session.image, NORMALIZED_IMAGE);
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

test("selectors derive panel intent, status, controls, and pass-through", () => {
  let state = loadImage();
  state = transitionMachine(state, {
    type: MACHINE_EVENT_KIND.REQUEST_PANEL_INTENT,
    intent: MACHINE_PANEL_INTENT.CLEAR_IMAGE_CONFIRM,
  }).state;

  assert.equal(selectPanelView(state).mainAction.kind, "confirm-clear-image");
  assert.equal(
    selectPanelStatusText(state),
    "Click Clear image? again to remove the current screenshot, placement, and pins.",
  );
  assert.deepEqual(selectOverlayPolicy(state), {
    hasImage: true,
    mode: MACHINE_MODE.ALIGN,
    isNativeMapInput: false,
    isPassThrough: false,
    canEditOverlay: true,
    arePinsVisible: true,
    ownsPointerHitTesting: true,
  });
  assert.deepEqual(selectOverlayPresentation(state), {
    mode: MACHINE_MODE.ALIGN,
    isPassThrough: false,
    arePinsVisible: true,
    ownsPointerHitTesting: true,
  });

  state = transitionMachine(state, {
    type: MACHINE_EVENT_KIND.SELECT_MODE,
    mode: MACHINE_MODE.TRACE,
  }).state;
  assert.equal(selectPanelView(state).modeSwitch.checked, true);
  assert.equal(selectOverlayPolicy(state).isPassThrough, true);
});

test("panel view derives primary action and mode switch directly from machine state", () => {
  let state = createInitialMachineState();
  assert.deepEqual(selectPanelView(state).modeSwitch, {
    checked: true,
    disabled: true,
    accessibleLabel: "Mode: Trace",
    mode: MACHINE_MODE.TRACE,
  });
  assert.equal(selectPanelView(state).mainAction.label, "Paste");

  state = addTwoPins(loadImage());
  assert.equal(selectPanelView(state).mainAction.label, "Clear 2 pins");

  state = transitionMachine(state, {
    type: MACHINE_EVENT_KIND.REQUEST_PANEL_INTENT,
    intent: MACHINE_PANEL_INTENT.CLEAR_PINS_CONFIRM,
  }).state;
  assert.equal(selectPanelView(state).mainAction.label, "Clear pins?");
  assert.equal(selectPanelView(state).mainAction.presentationKind, "confirm");

  state = transitionMachine(state, {
    type: MACHINE_EVENT_KIND.SELECT_MODE,
    mode: MACHINE_MODE.TRACE,
  }).state;
  assert.equal(selectPanelView(state).mainAction.label, "Clear image");
  assert.equal(selectPanelView(state).modeSwitch.disabled, false);
});

test("machine rejects panel intents that are invalid for the current state", () => {
  let state = createInitialMachineState();

  let result = transitionMachine(state, {
    type: MACHINE_EVENT_KIND.REQUEST_PANEL_INTENT,
    intent: MACHINE_PANEL_INTENT.CLEAR_IMAGE_CONFIRM,
  });
  assert.deepEqual(result.state, state);
  assert.deepEqual(result.effects, []);

  state = addPin(loadImage()).state;
  state = transitionMachine(state, {
    type: MACHINE_EVENT_KIND.SELECT_MODE,
    mode: MACHINE_MODE.TRACE,
  }).state;
  result = transitionMachine(state, {
    type: MACHINE_EVENT_KIND.REQUEST_PANEL_INTENT,
    intent: MACHINE_PANEL_INTENT.CLEAR_PINS_CONFIRM,
  });

  assert.deepEqual(result.state, state);
  assert.deepEqual(result.effects, []);
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
