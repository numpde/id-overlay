import {
  MACHINE_EVENT_KIND,
  MACHINE_HISTORY_KIND,
  MACHINE_INPUT_OVERRIDE,
  MACHINE_MODE,
  MACHINE_PANEL_INTENT,
  MACHINE_PLACEMENT_EDIT_KIND,
  MACHINE_POINTER_GESTURE_KIND,
  MACHINE_STATUS_NOTICE_KIND,
} from "./events.js";
import {
  createEmptyRegistration,
  createIdlePanel,
  createInitialMachineState,
  isKnownMachineMode,
  isKnownPanelIntent,
  isValidPanelRequestId,
  normalizeMachineState,
  normalizeOpacity,
  replacePanel,
  replacePlacementEdit,
  replaceRegistration,
  replaceInputRuntime,
  replaceSession,
  replaceStatus,
} from "./state.js";
import {
  createInvalidatedRegistration,
  createPlacementEditedRegistration,
  normalizePlacement,
  placementsEqual,
} from "../session.js";
import {
  commitHistoryRecord,
  moveRedoRecordToPast,
  moveUndoRecordToFuture,
} from "./history.js";
import { solveSimilarityTransform } from "../geometry.js";
import {
  createCancelPanelTimeoutEffect,
  createCancelManualPasteCaptureEffect,
  createCancelStatusTimeoutEffect,
  createReadPasteImageEffect,
  createStartPanelTimeoutEffect,
  createStartManualPasteCaptureEffect,
  createStartStatusTimeoutEffect,
} from "./effects.js";
import {
  isPanelIntentValidForState,
  selectPanelPolicy,
  shouldFitOnTrace,
} from "./policy.js";

export function transitionMachine(state = createInitialMachineState(), event = {}) {
  const currentState = normalizeMachineState(state);
  if (event.type === MACHINE_EVENT_KIND.UNDO) {
    return transitionUndo(currentState);
  }
  if (event.type === MACHINE_EVENT_KIND.REDO) {
    return transitionRedo(currentState);
  }
  return finalizeTransitionResult(transitionSemantic(currentState, event), {
    commitHistory: true,
    commitStatus: true,
  });
}

function transitionSemantic(state, event) {
  switch (event.type) {
    case MACHINE_EVENT_KIND.LOAD_IMAGE:
      return loadImage(state, event);
    case MACHINE_EVENT_KIND.CLEAR_IMAGE:
      return clearImage(state);
    case MACHINE_EVENT_KIND.RESTORE_IMAGE_SESSION:
      return restoreImageSession(state, event);
    case MACHINE_EVENT_KIND.SELECT_MODE:
      return selectMode(state, event);
    case MACHINE_EVENT_KIND.UPDATE_POINTER_RUNTIME:
      return updatePointerRuntime(state, event);
    case MACHINE_EVENT_KIND.BEGIN_POINTER_GESTURE:
      return beginPointerGesture(state, event);
    case MACHINE_EVENT_KIND.END_POINTER_GESTURE:
      return endPointerGesture(state, event);
    case MACHINE_EVENT_KIND.SET_INPUT_OVERRIDE:
      return setInputOverride(state, event);
    case MACHINE_EVENT_KIND.RESET_INPUT_RUNTIME:
      return resetInputRuntime(state, event);
    case MACHINE_EVENT_KIND.SET_OPACITY:
      return setOpacity(state, event);
    case MACHINE_EVENT_KIND.TOGGLE_PIN:
      return togglePin(state, event);
    case MACHINE_EVENT_KIND.ADD_PIN:
      return addPin(state, event);
    case MACHINE_EVENT_KIND.REMOVE_PIN:
      return removePin(state, event);
    case MACHINE_EVENT_KIND.CLEAR_PINS:
      return clearPins(state, event);
    case MACHINE_EVENT_KIND.RESTORE_REGISTRATION:
      return restoreRegistration(state, event);
    case MACHINE_EVENT_KIND.FIT_OVERLAY:
      return fitOverlay(state);
    case MACHINE_EVENT_KIND.BEGIN_PLACEMENT_EDIT:
      return beginPlacementEdit(state, event);
    case MACHINE_EVENT_KIND.PREVIEW_PLACEMENT_EDIT:
      return previewPlacementEdit(state, event);
    case MACHINE_EVENT_KIND.COMMIT_PLACEMENT_EDIT:
      return commitPlacementEdit(state);
    case MACHINE_EVENT_KIND.CANCEL_PLACEMENT_EDIT:
      return cancelPlacementEdit(state);
    case MACHINE_EVENT_KIND.APPLY_PLACEMENT_EDIT:
      return applyPlacementEdit(state, event);
    case MACHINE_EVENT_KIND.RESTORE_PLACEMENT:
      return restorePlacement(state, event);
    case MACHINE_EVENT_KIND.REQUEST_PANEL_INTENT:
      return requestPanelIntent(state, event);
    case MACHINE_EVENT_KIND.CANCEL_PANEL_INTENT:
      if (!canCancelPanelIntent(state, event)) {
        return createTransitionResult({
          state,
        });
      }
      return cancelPanelIntent(state, event);
    case MACHINE_EVENT_KIND.REPORT_STATUS_NOTICE:
      return reportStatusNotice(state, event);
    case MACHINE_EVENT_KIND.CLEAR_STATUS_NOTICE:
      return clearStatusNotice(state, event);
    default:
      return createTransitionResult({
        state,
      });
  }
}

function transitionUndo(state) {
  const moved = moveUndoRecordToFuture(state);
  if (!moved.record) {
    return finalizeTransitionResult(createTransitionResult({
      state,
      statusNotice: createStatusNotice(MACHINE_STATUS_NOTICE_KIND.UNDO_EMPTY),
    }), {
      commitHistory: false,
      commitStatus: true,
    });
  }
  const replay = finalizeTransitionResult(transitionSemantic(moved.state, moved.record.undoEvent), {
    commitHistory: false,
    commitStatus: false,
  });
  return finalizeTransitionResult(createTransitionResult({
    state: replay.state,
    effects: replay.effects,
    statusNotice: createStatusNotice(MACHINE_STATUS_NOTICE_KIND.UNDO, {
      label: moved.record.undoLabel,
    }),
    consumedHistoryRecord: moved.record,
  }), {
    commitHistory: false,
    commitStatus: true,
  });
}

function transitionRedo(state) {
  const moved = moveRedoRecordToPast(state);
  if (!moved.record) {
    return finalizeTransitionResult(createTransitionResult({
      state,
      statusNotice: createStatusNotice(MACHINE_STATUS_NOTICE_KIND.REDO_EMPTY),
    }), {
      commitHistory: false,
      commitStatus: true,
    });
  }
  const replay = finalizeTransitionResult(transitionSemantic(moved.state, moved.record.redoEvent), {
    commitHistory: false,
    commitStatus: false,
  });
  return finalizeTransitionResult(createTransitionResult({
    state: replay.state,
    effects: replay.effects,
    statusNotice: createStatusNotice(MACHINE_STATUS_NOTICE_KIND.REDO, {
      label: moved.record.redoLabel,
    }),
    consumedHistoryRecord: moved.record,
  }), {
    commitHistory: false,
    commitStatus: true,
  });
}

function loadImage(state, event) {
  if (!event.image || !canLoadImageForRequest(state, event)) {
    return createTransitionResult({
      state,
    });
  }
  const nextSession = {
    mode: MACHINE_MODE.ALIGN,
    image: event.image,
    placement: event.placement ?? null,
    registration: createEmptyRegistration(),
  };
  const nextState = resetInputRuntimeState(
    clearPlacementEditRuntime(replaceSession(state, nextSession)),
    { pointerScreenPx: null },
  );
  const panelTransition = clearPanelIntent(state, nextState);
  return createTransitionResult({
    state: panelTransition.state,
    effects: panelTransition.effects,
    statusNotice: createStatusNotice(MACHINE_STATUS_NOTICE_KIND.IMAGE_LOADED, {
      image: nextState.session.image,
    }),
    historyRecord: {
      kind: MACHINE_HISTORY_KIND.LOAD_IMAGE,
      label: "Loaded image",
      undoLabel: "Remove image",
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
    });
  }
  const previousSession = state.session;
  const nextState = resetInputRuntimeState(
    clearPlacementEditRuntime(replaceSession(state, {
      mode: MACHINE_MODE.TRACE,
      image: null,
      placement: null,
      registration: createEmptyRegistration(),
    })),
    { pointerScreenPx: null },
  );
  const panelTransition = clearPanelIntent(state, nextState);
  return createTransitionResult({
    state: panelTransition.state,
    effects: panelTransition.effects,
    statusNotice: createStatusNotice(MACHINE_STATUS_NOTICE_KIND.IMAGE_CLEARED),
    historyRecord: {
      kind: MACHINE_HISTORY_KIND.CLEAR_IMAGE,
      label: "Cleared image",
      undoLabel: "Reload image",
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
  const nextState = resetInputRuntimeState(
    clearPlacementEditRuntime(replaceSession(state, event.session ?? {})),
  );
  const panelTransition = clearPanelIntent(
    state,
    nextState,
  );
  return createTransitionResult({
    state: panelTransition.state,
    effects: panelTransition.effects,
    statusNotice: createStatusNotice(MACHINE_STATUS_NOTICE_KIND.IMAGE_RESTORED),
  });
}

function selectMode(state, event) {
  if (!isKnownMachineMode(event.mode)) {
    return createTransitionResult({
      state,
    });
  }
  const mode = event.mode;
  if (!state.session.image && mode === MACHINE_MODE.ALIGN) {
    return createTransitionResult({
      state,
    });
  }
  if (mode === state.session.mode && !(mode === MACHINE_MODE.TRACE && shouldFitOnTrace(state))) {
    return createTransitionResult({
      state,
    });
  }
  if (mode === MACHINE_MODE.TRACE && shouldFitOnTrace(state)) {
    return fitOverlay(state);
  }
  const nextState = resetInputRuntimeState(
    clearPlacementEditRuntime(replaceSession(state, { mode })),
  );
  const panelTransition = clearInvalidPanelIntent(
    state,
    nextState,
  );
  return createTransitionResult({
    state: panelTransition.state,
    effects: panelTransition.effects,
    statusNotice: createStatusNotice(MACHINE_STATUS_NOTICE_KIND.MODE_SELECTED, { mode }),
  });
}

function updatePointerRuntime(state, event) {
  return createTransitionResult({
    state: replaceInputRuntime(state, {
      pointerScreenPx: event.screenPx ?? null,
    }),
  });
}

function beginPointerGesture(state, event) {
  if (!Object.values(MACHINE_POINTER_GESTURE_KIND).includes(event.gestureKind)) {
    return createTransitionResult({
      state,
    });
  }
  return createTransitionResult({
    state: replaceInputRuntime(state, {
      pointerScreenPx: event.screenPx ?? null,
      activeGesture: {
        kind: event.gestureKind,
      },
    }),
  });
}

function endPointerGesture(state, event) {
  return createTransitionResult({
    state: replaceInputRuntime(state, {
      pointerScreenPx: event.screenPx ?? null,
      activeGesture: null,
    }),
  });
}

function setInputOverride(state, event) {
  const inputOverride = event.inputOverride === MACHINE_INPUT_OVERRIDE.PASS_THROUGH
    ? MACHINE_INPUT_OVERRIDE.PASS_THROUGH
    : null;
  return createTransitionResult({
    state: replaceInputRuntime(state, { inputOverride }),
  });
}

function resetInputRuntime(state, event) {
  return createTransitionResult({
    state: resetInputRuntimeState(state, { pointerScreenPx: event.screenPx }),
  });
}

function setOpacity(state, event) {
  if (!Number.isFinite(event.opacity)) {
    return createTransitionResult({
      state,
    });
  }
  return createTransitionResult({
    state: replaceSession(state, { opacity: normalizeOpacity(event.opacity) }),
  });
}

function togglePin(state, event) {
  if (!canEditPins(state)) {
    return createTransitionResult({
      state,
    });
  }
  if (event.existingPinId != null) {
    const existingPin = state.session.registration.pins.find(
      (pin) => pin.id === event.existingPinId,
    );
    if (!existingPin) {
      return createTransitionResult({
        state,
      });
    }
    return removePin(prepareRegistrationEditState(state, event), {
      type: MACHINE_EVENT_KIND.REMOVE_PIN,
      id: existingPin.id,
    });
  }
  return addPin(prepareRegistrationEditState(state, event), {
    type: MACHINE_EVENT_KIND.ADD_PIN,
    imagePx: event.imagePx,
    mapLatLon: event.mapLatLon,
  });
}

function addPin(state, event) {
  if (!state.session.image || !event.imagePx || !event.mapLatLon) {
    return createTransitionResult({
      state,
    });
  }
  const pin = {
    id: event.id ?? nextPinId(state.session.registration.pins),
    imagePx: event.imagePx,
    mapLatLon: event.mapLatLon,
  };
  const previousRegistration = state.session.registration;
  const nextRegistration = createInvalidatedRegistration({
    pins: [...previousRegistration.pins, pin],
  });
  const panelTransition = clearInvalidPanelIntent(
    state,
    clearPlacementEditRuntime(replaceSession(replaceRegistration(state, nextRegistration), {
      mode: MACHINE_MODE.ALIGN,
    })),
  );
  return createTransitionResult({
    state: panelTransition.state,
    effects: panelTransition.effects,
    statusNotice: createStatusNotice(MACHINE_STATUS_NOTICE_KIND.PIN_ADDED, {
      pinId: pin.id,
    }),
    historyRecord: createRegistrationHistoryRecord({
      kind: MACHINE_HISTORY_KIND.ADD_PIN,
      label: "Added pin",
      undoLabel: "Remove pin",
      redoLabel: "Add pin",
      previousRegistration,
      nextRegistration,
    }),
  });
}

function removePin(state, event) {
  const previousRegistration = state.session.registration;
  const removedPin = previousRegistration.pins.find((pin) => pin.id === event.id);
  const nextPins = previousRegistration.pins.filter((pin) => pin.id !== event.id);
  if (nextPins.length === previousRegistration.pins.length) {
    return createTransitionResult({
      state,
    });
  }
  const nextRegistration = createInvalidatedRegistration({
    pins: nextPins,
  });
  const panelTransition = clearInvalidPanelIntent(
    state,
    clearPlacementEditRuntime(replaceSession(replaceRegistration(state, nextRegistration), {
      mode: MACHINE_MODE.ALIGN,
    })),
  );
  return createTransitionResult({
    state: panelTransition.state,
    effects: panelTransition.effects,
    statusNotice: createStatusNotice(MACHINE_STATUS_NOTICE_KIND.PIN_REMOVED, {
      pinId: removedPin.id,
    }),
    historyRecord: createRegistrationHistoryRecord({
      kind: MACHINE_HISTORY_KIND.REMOVE_PIN,
      label: "Removed pin",
      undoLabel: "Restore pin",
      redoLabel: "Remove pin",
      previousRegistration,
      nextRegistration,
    }),
  });
}

function clearPins(state, event = {}) {
  const previousRegistration = state.session.registration;
  if (!selectPanelPolicy(state).canClearPins) {
    return createTransitionResult({
      state,
    });
  }
  const nextRegistration = createEmptyRegistration();
  const editState = prepareRegistrationEditState(state, event);
  const nextState = clearPlacementEditRuntime(replaceSession(replaceRegistration(editState, nextRegistration), {
    mode: MACHINE_MODE.ALIGN,
  }));
  const panelTransition = clearPanelIntent(state, nextState);
  return createTransitionResult({
    state: panelTransition.state,
    effects: panelTransition.effects,
    statusNotice: createStatusNotice(MACHINE_STATUS_NOTICE_KIND.PINS_CLEARED, {
      pinCount: previousRegistration.pins.length,
    }),
    historyRecord: createRegistrationHistoryRecord({
      kind: MACHINE_HISTORY_KIND.CLEAR_PINS,
      label: "Cleared pins",
      undoLabel: "Restore pins",
      redoLabel: "Clear pins",
      previousRegistration,
      nextRegistration,
    }),
  });
}

function restoreRegistration(state, event) {
  const panelTransition = clearInvalidPanelIntent(
    state,
    clearPlacementEditRuntime(replaceSession(replaceRegistration(state, event.registration), {
      mode: event.mode ?? state.session.mode,
    })),
  );
  return createTransitionResult({
    state: panelTransition.state,
    effects: panelTransition.effects,
  });
}

function prepareRegistrationEditState(state, event) {
  if (event.preservedPlacement?.type !== "similarity") {
    return state;
  }
  return replaceSession(state, {
    placement: event.preservedPlacement,
  });
}

function canEditPins(state) {
  return selectPanelPolicy(state).canEditOverlay;
}

function fitOverlay(state) {
  const previousSession = state.session;
  const solvedTransform = solveSimilarityTransform(state.session.registration.pins);
  if (!state.session.image || !solvedTransform) {
    const nextState = resetInputRuntimeState(
      clearPlacementEditRuntime(replaceSession(state, { mode: MACHINE_MODE.TRACE })),
    );
    const panelTransition = clearInvalidPanelIntent(
      state,
      nextState,
    );
    return createTransitionResult({
      state: panelTransition.state,
      effects: panelTransition.effects,
      statusNotice: createStatusNotice(MACHINE_STATUS_NOTICE_KIND.MODE_SELECTED, {
        mode: MACHINE_MODE.TRACE,
      }),
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
  const nextState = resetInputRuntimeState(
    clearPlacementEditRuntime(replaceSession(state, nextSession)),
  );
  const panelTransition = clearInvalidPanelIntent(
    state,
    nextState,
  );
  return createTransitionResult({
    state: panelTransition.state,
    effects: panelTransition.effects,
    statusNotice: createStatusNotice(MACHINE_STATUS_NOTICE_KIND.OVERLAY_FITTED, {
      pinCount: state.session.registration.pins.length,
    }),
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

function beginPlacementEdit(state, event) {
  if (!canEditPlacement(state)) {
    return createTransitionResult({
      state,
    });
  }
  const kind = normalizePlacementEditKind(event.editKind);
  const renderedPlacement = normalizePlacement(event.renderedPlacement);
  if (!kind || !renderedPlacement) {
    return createTransitionResult({
      state,
    });
  }
  return createTransitionResult({
    state: replacePlacementEdit(state, {
      kind,
      beforePlacement: renderedPlacement,
      beforeRegistration: state.session.registration,
      previewPlacement: renderedPlacement,
    }),
  });
}

function previewPlacementEdit(state, event) {
  if (!state.runtime.placementEdit) {
    return createTransitionResult({
      state,
    });
  }
  if (!canEditPlacement(state)) {
    return createTransitionResult({
      state: clearPlacementEditRuntime(state),
    });
  }
  const previewPlacement = normalizePlacement(event.placement);
  if (!previewPlacement) {
    return createTransitionResult({
      state,
    });
  }
  return createTransitionResult({
    state: replacePlacementEdit(state, {
      ...state.runtime.placementEdit,
      previewPlacement,
    }),
  });
}

function commitPlacementEdit(state) {
  const edit = state.runtime.placementEdit;
  if (!edit) {
    return createTransitionResult({
      state,
    });
  }
  if (!canEditPlacement(state)) {
    return createTransitionResult({
      state: clearPlacementEditRuntime(state),
    });
  }
  const stateWithoutPreview = replacePlacementEdit(state, null);
  if (placementsEqual(edit.beforePlacement, edit.previewPlacement)) {
    return createTransitionResult({
      state: stateWithoutPreview,
    });
  }
  return commitPlacementChange(stateWithoutPreview, {
    placement: edit.previewPlacement,
    previousPlacement: edit.beforePlacement,
    previousRegistration: edit.beforeRegistration,
    editKind: edit.kind,
  });
}

function cancelPlacementEdit(state) {
  if (!state.runtime.placementEdit) {
    return createTransitionResult({
      state,
    });
  }
  return createTransitionResult({
    state: replacePlacementEdit(state, null),
  });
}

function applyPlacementEdit(state, event) {
  if (!canEditPlacement(state)) {
    return createTransitionResult({
      state: clearPlacementEditRuntime(state),
    });
  }
  const kind = normalizePlacementEditKind(event.editKind);
  const renderedPlacement = normalizePlacement(event.renderedPlacement);
  const nextPlacement = normalizePlacement(event.placement);
  if (!kind || !renderedPlacement || !nextPlacement) {
    return createTransitionResult({
      state,
    });
  }
  if (placementsEqual(renderedPlacement, nextPlacement)) {
    return createTransitionResult({
      state: replacePlacementEdit(state, null),
    });
  }
  return commitPlacementChange(replacePlacementEdit(state, null), {
    placement: nextPlacement,
    previousPlacement: renderedPlacement,
    previousRegistration: state.session.registration,
    editKind: kind,
  });
}

function commitPlacementChange(state, event) {
  if (!state.session.image || !Object.hasOwn(event, "placement")) {
    return createTransitionResult({
      state,
    });
  }
  const previousPlacement = Object.hasOwn(event, "previousPlacement")
    ? event.previousPlacement
    : state.session.placement;
  const previousRegistration = event.previousRegistration ?? state.session.registration;
  const nextPlacement = event.placement;
  const nextRegistration = event.registration ?? createPlacementEditedRegistration(state.session.registration);
  const nextState = replacePlacementEdit(replaceRegistration(replaceSession(state, {
    placement: nextPlacement,
  }), nextRegistration), null);
  const historyMetadata = resolvePlacementHistoryMetadata(event.editKind);
  return createTransitionResult({
    state: nextState,
    statusNotice: createStatusNotice(MACHINE_STATUS_NOTICE_KIND.PLACEMENT_CHANGED, {
      editKind: event.editKind,
    }),
    historyRecord: {
      kind: historyMetadata.kind,
      label: historyMetadata.label,
      undoLabel: historyMetadata.undoLabel,
      redoLabel: historyMetadata.redoLabel,
      undoEvent: {
        type: MACHINE_EVENT_KIND.RESTORE_PLACEMENT,
        placement: previousPlacement,
        registration: previousRegistration,
      },
      redoEvent: {
        type: MACHINE_EVENT_KIND.RESTORE_PLACEMENT,
        placement: nextPlacement,
        registration: nextRegistration,
      },
    },
  });
}

function restorePlacement(state, event) {
  if (!state.session.image || !Object.hasOwn(event, "placement")) {
    return createTransitionResult({
      state,
    });
  }
  const nextRegistration = event.registration ?? state.session.registration;
  return createTransitionResult({
    state: replacePlacementEdit(replaceRegistration(replaceSession(state, {
      placement: event.placement,
    }), nextRegistration), null),
  });
}

function canEditPlacement(state) {
  return selectPanelPolicy(state).canEditOverlay;
}

function clearPlacementEditRuntime(state) {
  return state.runtime.placementEdit ? replacePlacementEdit(state, null) : state;
}

function resetInputRuntimeState(state, { pointerScreenPx = state.runtime.pointer.screenPx } = {}) {
  return replaceInputRuntime(state, {
    pointerScreenPx: pointerScreenPx ?? null,
    activeGesture: null,
    inputOverride: null,
  });
}

function normalizePlacementEditKind(kind) {
  return Object.values(MACHINE_PLACEMENT_EDIT_KIND).includes(kind) ? kind : null;
}

function requestPanelIntent(state, event) {
  if (!isKnownPanelIntent(event.intent)) {
    return createTransitionResult({
      state,
    });
  }
  const intent = event.intent;
  if (intent === MACHINE_PANEL_INTENT.IDLE) {
    return cancelPanelIntent(state);
  }
  if (!isPanelIntentValidForState(state, intent)) {
    return createTransitionResult({
      state,
    });
  }
  const requestId = nextPanelRequestId(state);
  const nextState = replaceStatus(replacePanel(state, { intent, requestId }), {
    notice: null,
  });
  return createTransitionResult({
    state: nextState,
    effects: [
      ...createCancelPanelIntentEffects(state),
      ...createCancelStatusTimeoutEffects(state),
      ...createPanelIntentEffects({ intent, requestId }),
    ],
  });
}

function cancelPanelIntent(state, event = {}) {
  const panelTransition = clearPanelIntent(state);
  return createTransitionResult({
    state: panelTransition.state,
    effects: panelTransition.effects,
    statusNotice: createStatusNotice(event.noticeKind, event.noticePayload),
  });
}

function reportStatusNotice(state, event) {
  return createTransitionResult({
    state,
    statusNotice: createStatusNotice(event.noticeKind, event.noticePayload),
  });
}

function canCancelPanelIntent(state, event) {
  if (event.requestId == null) {
    return true;
  }
  return isValidPanelRequestId(event.requestId) && state.panel.requestId === event.requestId;
}

function canLoadImageForRequest(state, event) {
  if (event.requestId == null) {
    return true;
  }
  return (
    state.panel.intent === MACHINE_PANEL_INTENT.PASTE_ARMED &&
    isValidPanelRequestId(event.requestId) &&
    state.panel.requestId === event.requestId
  );
}

function clearStatusNotice(state, event) {
  if (!state.status.notice) {
    return createTransitionResult({ state });
  }
  if (event.requestId != null && event.requestId !== state.status.notice.requestId) {
    return createTransitionResult({ state });
  }
  return createTransitionResult({
    state: replaceStatus(state, { notice: null }),
    effects: createCancelStatusTimeoutEffects(state),
  });
}

function finalizeTransitionResult(result, { commitHistory, commitStatus }) {
  let state = result.state;
  let effects = result.effects;
  let historyRecord = result.historyRecord;
  if (commitHistory && historyRecord) {
    state = commitHistoryRecord(state, historyRecord);
  } else {
    historyRecord = null;
  }
  if (commitStatus && result.statusNotice) {
    const statusTransition = applyStatusNotice(state, result.statusNotice);
    state = statusTransition.state;
    effects = [...effects, ...statusTransition.effects];
  }
  return {
    state,
    effects,
    historyRecord,
    consumedHistoryRecord: result.consumedHistoryRecord,
  };
}

function createTransitionResult({
  state,
  effects = [],
  statusNotice = null,
  historyRecord = null,
  consumedHistoryRecord = null,
}) {
  return {
    state,
    effects,
    statusNotice,
    historyRecord,
    consumedHistoryRecord,
  };
}

function createStatusNotice(kind, payload = null) {
  return kind ? { kind, payload } : null;
}

function applyStatusNotice(state, statusNotice) {
  const requestId = nextStatusRequestId(state);
  return {
    state: replaceStatus(state, {
      notice: {
        requestId,
        kind: statusNotice.kind,
        payload: statusNotice.payload,
      },
      lastRequestId: requestId,
    }),
    effects: [
      ...createCancelStatusTimeoutEffects(state),
      createStartStatusTimeoutEffect({ requestId }),
    ],
  };
}

function clearPanelIntent(state, nextState = state) {
  return {
    state: replacePanel(nextState, createIdlePanel()),
    effects: createCancelPanelIntentEffects(state),
  };
}

function clearInvalidPanelIntent(state, nextState) {
  if (isPanelIntentValidForState(nextState)) {
    return {
      state: nextState,
      effects: [],
    };
  }
  return clearPanelIntent(state, nextState);
}

function nextPanelRequestId(state) {
  return state.panel.requestId === null ? 1 : state.panel.requestId + 1;
}

function nextStatusRequestId(state) {
  return state.status.lastRequestId + 1;
}

function createCancelPanelIntentEffects(state) {
  if (state.panel.requestId === null) {
    return [];
  }
  const effects = [
    createCancelPanelTimeoutEffect({
      requestId: state.panel.requestId,
    }),
  ];
  if (state.panel.intent === MACHINE_PANEL_INTENT.PASTE_ARMED) {
    effects.push(createCancelManualPasteCaptureEffect({
      requestId: state.panel.requestId,
    }));
  }
  return effects;
}

function createCancelStatusTimeoutEffects(state) {
  if (!state.status.notice) {
    return [];
  }
  return [
    createCancelStatusTimeoutEffect({
      requestId: state.status.notice.requestId,
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
    createStartManualPasteCaptureEffect({ requestId }),
    timeoutEffect,
  ];
}

function nextPinId(pins) {
  return pins.reduce((maxId, pin) => Math.max(maxId, Number(pin.id) || 0), 0) + 1;
}

function createRegistrationHistoryRecord({
  kind,
  label,
  undoLabel,
  redoLabel,
  previousRegistration,
  nextRegistration,
}) {
  return {
    kind,
    label,
    undoLabel,
    redoLabel,
    undoEvent: createRestoreRegistrationEvent(previousRegistration),
    redoEvent: createRestoreRegistrationEvent(nextRegistration),
  };
}

function createRestoreRegistrationEvent(registration) {
  return {
    type: MACHINE_EVENT_KIND.RESTORE_REGISTRATION,
    registration,
    mode: MACHINE_MODE.ALIGN,
  };
}

const PLACEMENT_HISTORY_METADATA = Object.freeze({
  [MACHINE_PLACEMENT_EDIT_KIND.MOVE]: Object.freeze({
    kind: MACHINE_HISTORY_KIND.MOVE_OVERLAY,
    label: "Moved overlay",
    undoLabel: "Undo move overlay",
    redoLabel: "Redo move overlay",
  }),
  [MACHINE_PLACEMENT_EDIT_KIND.ROTATE]: Object.freeze({
    kind: MACHINE_HISTORY_KIND.ROTATE_OVERLAY,
    label: "Rotated overlay",
    undoLabel: "Undo rotate overlay",
    redoLabel: "Redo rotate overlay",
  }),
  [MACHINE_PLACEMENT_EDIT_KIND.SCALE]: Object.freeze({
    kind: MACHINE_HISTORY_KIND.SCALE_OVERLAY,
    label: "Scaled overlay",
    undoLabel: "Undo scale overlay",
    redoLabel: "Redo scale overlay",
  }),
});

function resolvePlacementHistoryMetadata(editKind) {
  return PLACEMENT_HISTORY_METADATA[editKind] ?? PLACEMENT_HISTORY_METADATA[MACHINE_PLACEMENT_EDIT_KIND.MOVE];
}
