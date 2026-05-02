import {
  MACHINE_EVENT_KIND,
  MACHINE_FEEDBACK_KIND,
  MACHINE_HISTORY_KIND,
  MACHINE_MODE,
  MACHINE_PANEL_INTENT,
  MACHINE_PLACEMENT_EDIT_KIND,
} from "./events.js";
import {
  createEmptyRegistration,
  createIdlePanel,
  createInitialMachineState,
  isValidPanelRequestId,
  normalizeMachineState,
  normalizeMode,
  normalizePanelIntent,
  replaceHistory,
  replacePanel,
  replaceRegistration,
  replaceSession,
} from "./state.js";
import {
  commitHistoryRecord,
  moveRedoRecordToPast,
  moveUndoRecordToFuture,
} from "./history.js";
import { solveSimilarityTransform } from "./geometry.js";
import {
  createCancelPanelTimeoutEffect,
  createReadPasteImageEffect,
  createStartPanelTimeoutEffect,
} from "./effects.js";

export function transitionMachine(state = createInitialMachineState(), event = {}) {
  const currentState = normalizeMachineState(state);
  if (event.type === MACHINE_EVENT_KIND.UNDO) {
    return transitionUndo(currentState);
  }
  if (event.type === MACHINE_EVENT_KIND.REDO) {
    return transitionRedo(currentState);
  }
  return transitionSemantic(currentState, event, { commitHistory: true });
}

function transitionSemantic(state, event, { commitHistory }) {
  switch (event.type) {
    case MACHINE_EVENT_KIND.LOAD_IMAGE:
      return withOptionalHistory(loadImage(state, event), commitHistory);
    case MACHINE_EVENT_KIND.CLEAR_IMAGE:
      return withOptionalHistory(clearImage(state), commitHistory);
    case MACHINE_EVENT_KIND.RESTORE_IMAGE_SESSION:
      return withoutHistory(restoreImageSession(state, event));
    case MACHINE_EVENT_KIND.SELECT_MODE:
      return withOptionalHistory(selectMode(state, event), commitHistory);
    case MACHINE_EVENT_KIND.ADD_PIN:
      return withOptionalHistory(addPin(state, event), commitHistory);
    case MACHINE_EVENT_KIND.REMOVE_PIN:
      return withOptionalHistory(removePin(state, event), commitHistory);
    case MACHINE_EVENT_KIND.CLEAR_PINS:
      return withOptionalHistory(clearPins(state), commitHistory);
    case MACHINE_EVENT_KIND.RESTORE_REGISTRATION:
      return withoutHistory(restoreRegistration(state, event));
    case MACHINE_EVENT_KIND.FIT_OVERLAY:
      return withOptionalHistory(fitOverlay(state), commitHistory);
    case MACHINE_EVENT_KIND.SET_PLACEMENT:
      return withOptionalHistory(setPlacement(state, event), commitHistory);
    case MACHINE_EVENT_KIND.REQUEST_PANEL_INTENT:
      return withoutHistory(requestPanelIntent(state, event));
    case MACHINE_EVENT_KIND.CANCEL_PANEL_INTENT:
      if (!canCancelPanelIntent(state, event)) {
        return createTransitionResult({
          state,
          feedback: createFeedback(MACHINE_FEEDBACK_KIND.NONE),
        });
      }
      return withoutHistory(setPanelIntent(state, MACHINE_PANEL_INTENT.IDLE));
    case MACHINE_EVENT_KIND.SET_STATUS_OVERRIDE:
      return withoutHistory(setStatusOverride(state, event.message));
    case MACHINE_EVENT_KIND.CLEAR_STATUS_OVERRIDE:
      return withoutHistory(setStatusOverride(state, null));
    default:
      return createTransitionResult({
        state,
        feedback: createFeedback(MACHINE_FEEDBACK_KIND.NONE),
      });
  }
}

function transitionUndo(state) {
  const moved = moveUndoRecordToFuture(state);
  if (!moved.record) {
    return createTransitionResult({
      state,
      feedback: createFeedback(MACHINE_FEEDBACK_KIND.UNDO_EMPTY, "Nothing to undo."),
    });
  }
  const replay = transitionSemantic(moved.state, moved.record.undoEvent, {
    commitHistory: false,
  });
  return createTransitionResult({
    state: replay.state,
    effects: replay.effects,
    feedback: createFeedback(MACHINE_FEEDBACK_KIND.UNDO, moved.record.undoLabel),
    consumedHistoryRecord: moved.record,
  });
}

function transitionRedo(state) {
  const moved = moveRedoRecordToPast(state);
  if (!moved.record) {
    return createTransitionResult({
      state,
      feedback: createFeedback(MACHINE_FEEDBACK_KIND.REDO_EMPTY, "Nothing to redo."),
    });
  }
  const replay = transitionSemantic(moved.state, moved.record.redoEvent, {
    commitHistory: false,
  });
  return createTransitionResult({
    state: replay.state,
    effects: replay.effects,
    feedback: createFeedback(MACHINE_FEEDBACK_KIND.REDO, moved.record.redoLabel),
    consumedHistoryRecord: moved.record,
  });
}

function loadImage(state, event) {
  if (!event.image) {
    return createTransitionResult({
      state,
      feedback: createFeedback(MACHINE_FEEDBACK_KIND.NONE),
    });
  }
  const nextSession = {
    mode: MACHINE_MODE.ALIGN,
    image: event.image,
    placement: event.placement ?? null,
    registration: createEmptyRegistration(),
  };
  const nextState = replaceSession(state, nextSession);
  const panelEffects = createCancelPanelTimeoutEffects(state);
  return createTransitionResult({
    state: resetPanel(nextState),
    effects: panelEffects,
    feedback: createFeedback(MACHINE_FEEDBACK_KIND.IMAGE_LOADED, "Loaded image."),
    historyRecord: {
      kind: MACHINE_HISTORY_KIND.LOAD_IMAGE,
      label: "Loaded image",
      undoLabel: "Clear image",
      redoLabel: "Reload image",
      undoEvent: { type: MACHINE_EVENT_KIND.CLEAR_IMAGE },
      redoEvent: {
        type: MACHINE_EVENT_KIND.RESTORE_IMAGE_SESSION,
        session: nextState.session,
      },
    },
  });
}

function clearImage(state) {
  if (!state.session.image) {
    return createTransitionResult({
      state,
      feedback: createFeedback(MACHINE_FEEDBACK_KIND.NONE),
    });
  }
  const previousSession = state.session;
  const panelEffects = createCancelPanelTimeoutEffects(state);
  const nextState = resetPanel(replaceSession(state, {
    mode: MACHINE_MODE.TRACE,
    image: null,
    placement: null,
    registration: createEmptyRegistration(),
  }));
  return createTransitionResult({
    state: nextState,
    effects: panelEffects,
    feedback: createFeedback(MACHINE_FEEDBACK_KIND.IMAGE_CLEARED, "Cleared image."),
    historyRecord: {
      kind: MACHINE_HISTORY_KIND.CLEAR_IMAGE,
      label: "Cleared image",
      undoLabel: "Restore image",
      redoLabel: "Clear image",
      undoEvent: {
        type: MACHINE_EVENT_KIND.RESTORE_IMAGE_SESSION,
        session: previousSession,
      },
      redoEvent: { type: MACHINE_EVENT_KIND.CLEAR_IMAGE },
    },
  });
}

function restoreImageSession(state, event) {
  return createTransitionResult({
    state: resetPanel(replaceSession(state, event.session ?? {})),
    feedback: createFeedback(MACHINE_FEEDBACK_KIND.IMAGE_RESTORED, "Restored image."),
  });
}

function selectMode(state, event) {
  const mode = normalizeMode(event.mode);
  if (!state.session.image && mode === MACHINE_MODE.ALIGN) {
    return createTransitionResult({
      state,
      feedback: createFeedback(MACHINE_FEEDBACK_KIND.NONE),
    });
  }
  if (mode === state.session.mode && !(mode === MACHINE_MODE.TRACE && shouldFitOnTrace(state))) {
    return createTransitionResult({
      state,
      feedback: createFeedback(MACHINE_FEEDBACK_KIND.NONE),
    });
  }
  if (mode === MACHINE_MODE.TRACE && shouldFitOnTrace(state)) {
    return fitOverlay(state);
  }
  return createTransitionResult({
    state: replaceSession(state, { mode }),
    feedback: createFeedback(MACHINE_FEEDBACK_KIND.MODE_SELECTED, `Switched to ${mode}.`),
  });
}

function addPin(state, event) {
  if (!state.session.image || !event.imagePx || !event.mapLatLon) {
    return createTransitionResult({
      state,
      feedback: createFeedback(MACHINE_FEEDBACK_KIND.NONE),
    });
  }
  const pin = {
    id: event.id ?? nextPinId(state.session.registration.pins),
    imagePx: event.imagePx,
    mapLatLon: event.mapLatLon,
  };
  const previousRegistration = state.session.registration;
  const nextRegistration = {
    pins: [...previousRegistration.pins, pin],
    solvedTransform: null,
    dirty: true,
  };
  return createTransitionResult({
    state: replaceSession(replaceRegistration(state, nextRegistration), {
      mode: MACHINE_MODE.ALIGN,
    }),
    feedback: createFeedback(MACHINE_FEEDBACK_KIND.PIN_ADDED, "Added pin."),
    historyRecord: {
      kind: MACHINE_HISTORY_KIND.ADD_PIN,
      label: "Added pin",
      undoLabel: "Remove pin",
      redoLabel: "Add pin",
      undoEvent: {
        type: MACHINE_EVENT_KIND.RESTORE_REGISTRATION,
        registration: previousRegistration,
        mode: MACHINE_MODE.ALIGN,
        feedbackKind: MACHINE_FEEDBACK_KIND.PIN_REMOVED,
      },
      redoEvent: {
        type: MACHINE_EVENT_KIND.RESTORE_REGISTRATION,
        registration: nextRegistration,
        mode: MACHINE_MODE.ALIGN,
        feedbackKind: MACHINE_FEEDBACK_KIND.PIN_ADDED,
      },
    },
  });
}

function removePin(state, event) {
  const previousRegistration = state.session.registration;
  const nextPins = previousRegistration.pins.filter((pin) => pin.id !== event.id);
  if (nextPins.length === previousRegistration.pins.length) {
    return createTransitionResult({
      state,
      feedback: createFeedback(MACHINE_FEEDBACK_KIND.NONE),
    });
  }
  const nextRegistration = {
    pins: nextPins,
    solvedTransform: null,
    dirty: true,
  };
  return createTransitionResult({
    state: replaceSession(replaceRegistration(state, nextRegistration), {
      mode: MACHINE_MODE.ALIGN,
    }),
    feedback: createFeedback(MACHINE_FEEDBACK_KIND.PIN_REMOVED, "Removed pin."),
    historyRecord: {
      kind: MACHINE_HISTORY_KIND.REMOVE_PIN,
      label: "Removed pin",
      undoLabel: "Restore pin",
      redoLabel: "Remove pin",
      undoEvent: {
        type: MACHINE_EVENT_KIND.RESTORE_REGISTRATION,
        registration: previousRegistration,
        mode: MACHINE_MODE.ALIGN,
        feedbackKind: MACHINE_FEEDBACK_KIND.PIN_ADDED,
      },
      redoEvent: {
        type: MACHINE_EVENT_KIND.RESTORE_REGISTRATION,
        registration: nextRegistration,
        mode: MACHINE_MODE.ALIGN,
        feedbackKind: MACHINE_FEEDBACK_KIND.PIN_REMOVED,
      },
    },
  });
}

function clearPins(state) {
  const previousRegistration = state.session.registration;
  if (previousRegistration.pins.length === 0) {
    return createTransitionResult({
      state,
      feedback: createFeedback(MACHINE_FEEDBACK_KIND.NONE),
    });
  }
  const nextRegistration = createEmptyRegistration();
  const panelEffects = createCancelPanelTimeoutEffects(state);
  return createTransitionResult({
    state: resetPanel(replaceSession(replaceRegistration(state, nextRegistration), {
      mode: MACHINE_MODE.ALIGN,
    })),
    effects: panelEffects,
    feedback: createFeedback(MACHINE_FEEDBACK_KIND.PINS_CLEARED, "Cleared pins."),
    historyRecord: {
      kind: MACHINE_HISTORY_KIND.CLEAR_PINS,
      label: "Cleared pins",
      undoLabel: "Restore pins",
      redoLabel: "Clear pins",
      undoEvent: {
        type: MACHINE_EVENT_KIND.RESTORE_REGISTRATION,
        registration: previousRegistration,
        mode: MACHINE_MODE.ALIGN,
        feedbackKind: MACHINE_FEEDBACK_KIND.PINS_RESTORED,
      },
      redoEvent: {
        type: MACHINE_EVENT_KIND.RESTORE_REGISTRATION,
        registration: nextRegistration,
        mode: MACHINE_MODE.ALIGN,
        feedbackKind: MACHINE_FEEDBACK_KIND.PINS_CLEARED,
      },
    },
  });
}

function restoreRegistration(state, event) {
  return createTransitionResult({
    state: replaceSession(replaceRegistration(state, event.registration), {
      mode: event.mode ?? state.session.mode,
    }),
    feedback: createFeedback(event.feedbackKind ?? MACHINE_FEEDBACK_KIND.NONE),
  });
}

function fitOverlay(state) {
  const previousSession = state.session;
  const solvedTransform = solveSimilarityTransform(state.session.registration.pins);
  if (!state.session.image || !solvedTransform) {
    return createTransitionResult({
      state: replaceSession(state, { mode: MACHINE_MODE.TRACE }),
      feedback: createFeedback(MACHINE_FEEDBACK_KIND.MODE_SELECTED, "Switched to trace."),
    });
  }
  const nextSession = {
    ...state.session,
    mode: MACHINE_MODE.TRACE,
    registration: {
      ...state.session.registration,
      solvedTransform,
      dirty: false,
    },
  };
  return createTransitionResult({
    state: replaceSession(state, nextSession),
    feedback: createFeedback(MACHINE_FEEDBACK_KIND.OVERLAY_FITTED, "Fit overlay from pins."),
    historyRecord: {
      kind: MACHINE_HISTORY_KIND.FIT_OVERLAY,
      label: "Fit overlay from pins",
      undoLabel: "Undo fit overlay",
      redoLabel: "Fit overlay from pins",
      undoEvent: {
        type: MACHINE_EVENT_KIND.RESTORE_IMAGE_SESSION,
        session: previousSession,
      },
      redoEvent: {
        type: MACHINE_EVENT_KIND.RESTORE_IMAGE_SESSION,
        session: nextSession,
      },
    },
  });
}

function setPlacement(state, event) {
  if (!state.session.image || !Object.hasOwn(event, "placement")) {
    return createTransitionResult({
      state,
      feedback: createFeedback(MACHINE_FEEDBACK_KIND.NONE),
    });
  }
  const previousPlacement = state.session.placement;
  const nextPlacement = event.placement;
  const nextRegistration = {
    ...state.session.registration,
    solvedTransform: null,
    dirty: state.session.registration.pins.length > 0
      ? true
      : state.session.registration.dirty,
  };
  const nextState = replaceRegistration(replaceSession(state, {
    placement: nextPlacement,
  }), nextRegistration);
  const kind = placementHistoryKind(event.editKind);
  return createTransitionResult({
    state: nextState,
    feedback: createFeedback(MACHINE_FEEDBACK_KIND.PLACEMENT_CHANGED, "Adjusted overlay."),
    historyRecord: {
      kind,
      label: placementLabel(event.editKind),
      undoLabel: undoPlacementLabel(event.editKind),
      redoLabel: redoPlacementLabel(event.editKind),
      undoEvent: {
        type: MACHINE_EVENT_KIND.SET_PLACEMENT,
        placement: previousPlacement,
        editKind: event.editKind,
      },
      redoEvent: {
        type: MACHINE_EVENT_KIND.SET_PLACEMENT,
        placement: nextPlacement,
        editKind: event.editKind,
      },
    },
  });
}

function requestPanelIntent(state, event) {
  const intent = normalizePanelIntent(event.intent);
  if (intent === MACHINE_PANEL_INTENT.IDLE) {
    return setPanelIntent(state, intent);
  }
  const requestId = nextPanelRequestId(state);
  return createTransitionResult({
    state: replacePanel(state, { intent, requestId }),
    effects: [
      ...createCancelPanelTimeoutEffects(state),
      ...createPanelIntentEffects({ intent, requestId }),
    ],
    feedback: createFeedback(MACHINE_FEEDBACK_KIND.PANEL_INTENT_CHANGED),
  });
}

function setPanelIntent(state, intent) {
  const nextIntent = normalizePanelIntent(intent);
  return createTransitionResult({
    state: replacePanel(state, {
      intent: nextIntent,
      requestId: nextIntent === MACHINE_PANEL_INTENT.IDLE
        ? null
        : state.panel.requestId,
    }),
    effects: nextIntent === MACHINE_PANEL_INTENT.IDLE
      ? createCancelPanelTimeoutEffects(state)
      : [],
    feedback: createFeedback(MACHINE_FEEDBACK_KIND.PANEL_INTENT_CHANGED),
  });
}

function canCancelPanelIntent(state, event) {
  if (event.requestId == null) {
    return true;
  }
  return isValidPanelRequestId(event.requestId) && state.panel.requestId === event.requestId;
}

function setStatusOverride(state, message) {
  return createTransitionResult({
    state: {
      ...state,
      status: {
        messageOverride: message ? { message } : null,
      },
    },
    feedback: createFeedback(MACHINE_FEEDBACK_KIND.STATUS_OVERRIDE_CHANGED),
  });
}

function withOptionalHistory(result, commitHistory) {
  if (!commitHistory || !result.historyRecord) {
    return result;
  }
  return {
    ...result,
    state: commitHistoryRecord(result.state, result.historyRecord),
  };
}

function withoutHistory(result) {
  return {
    ...result,
    historyRecord: null,
  };
}

function createTransitionResult({
  state,
  effects = [],
  feedback = createFeedback(MACHINE_FEEDBACK_KIND.NONE),
  historyRecord = null,
  consumedHistoryRecord = null,
}) {
  return {
    state,
    effects,
    feedback,
    historyRecord,
    consumedHistoryRecord,
  };
}

function createFeedback(kind, message = "") {
  return { kind, message };
}

function resetPanel(state) {
  return replacePanel(state, createIdlePanel());
}

function nextPanelRequestId(state) {
  return state.panel.requestId === null ? 1 : state.panel.requestId + 1;
}

function createCancelPanelTimeoutEffects(state) {
  if (state.panel.requestId === null) {
    return [];
  }
  return [
    createCancelPanelTimeoutEffect({
      requestId: state.panel.requestId,
    }),
  ];
}

function createPanelIntentEffects({ intent, requestId }) {
  const timeoutEffect = createStartPanelTimeoutEffect({ intent, requestId });
  if (intent !== MACHINE_PANEL_INTENT.PASTE_ARMED) {
    return [timeoutEffect];
  }
  return [
    createReadPasteImageEffect({ requestId }),
    timeoutEffect,
  ];
}

function shouldFitOnTrace(state) {
  const registration = state.session.registration;
  return (
    Boolean(state.session.image) &&
    registration.pins.length >= 2 &&
    (registration.dirty || !registration.solvedTransform)
  );
}

function nextPinId(pins) {
  return pins.reduce((maxId, pin) => Math.max(maxId, Number(pin.id) || 0), 0) + 1;
}

function placementHistoryKind(editKind) {
  if (editKind === MACHINE_PLACEMENT_EDIT_KIND.ROTATE) {
    return MACHINE_HISTORY_KIND.ROTATE_OVERLAY;
  }
  if (editKind === MACHINE_PLACEMENT_EDIT_KIND.SCALE) {
    return MACHINE_HISTORY_KIND.SCALE_OVERLAY;
  }
  return MACHINE_HISTORY_KIND.MOVE_OVERLAY;
}

function placementLabel(editKind) {
  if (editKind === MACHINE_PLACEMENT_EDIT_KIND.ROTATE) {
    return "Rotated overlay";
  }
  if (editKind === MACHINE_PLACEMENT_EDIT_KIND.SCALE) {
    return "Scaled overlay";
  }
  return "Moved overlay";
}

function undoPlacementLabel(editKind) {
  if (editKind === MACHINE_PLACEMENT_EDIT_KIND.ROTATE) {
    return "Undo rotate overlay";
  }
  if (editKind === MACHINE_PLACEMENT_EDIT_KIND.SCALE) {
    return "Undo scale overlay";
  }
  return "Undo move overlay";
}

function redoPlacementLabel(editKind) {
  if (editKind === MACHINE_PLACEMENT_EDIT_KIND.ROTATE) {
    return "Redo rotate overlay";
  }
  if (editKind === MACHINE_PLACEMENT_EDIT_KIND.SCALE) {
    return "Redo scale overlay";
  }
  return "Redo move overlay";
}
