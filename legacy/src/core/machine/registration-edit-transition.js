import {
  MACHINE_HISTORY_KIND,
  MACHINE_MODE,
} from "./events.js";
import {
  MACHINE_STATUS_NOTICE_KIND,
  createStatusNotice,
} from "./status-notices.js";
import {
  MACHINE_HISTORY_REPLAY_OPERATION,
  createSemanticHistoryRecord,
} from "./history.js";
import {
  createEmptyRegistration,
  replaceRegistration,
  replaceSession,
} from "./state.js";
import {
  createInvalidatedRegistration,
} from "../registration.js";
import { selectPanelPolicy } from "./policy.js";
import {
  clearInvalidPanelIntent,
  clearPanelIntent,
} from "./panel-status-transition.js";
import { clearPlacementEditRuntime } from "./placement-edit-runtime-transition.js";
import {
  createTransitionResult,
} from "./transition-result.js";

export function applyAddPinEdit(state, event) {
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
  return commitRegistrationEdit(prepareRegistrationEditState(state, event), {
    nextRegistration,
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

export function applyRemovePinEdit(state, event) {
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
  return commitRegistrationEdit(prepareRegistrationEditState(state, event), {
    nextRegistration,
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

export function applyClearPinsEdit(state, event = {}) {
  const previousRegistration = state.session.registration;
  if (!selectPanelPolicy(state).canClearPins) {
    return createTransitionResult({
      state,
    });
  }
  const nextRegistration = createEmptyRegistration();
  const editState = prepareRegistrationEditState(state, event);
  return commitRegistrationEdit(editState, {
    sourceState: state,
    settlePanel: clearPanelIntent,
    nextRegistration,
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

function prepareRegistrationEditState(state, event) {
  if (event.preservedPlacement?.type !== "similarity") {
    return state;
  }
  return replaceSession(state, {
    placement: event.preservedPlacement,
  });
}

function commitRegistrationEdit(state, {
  sourceState = state,
  settlePanel = clearInvalidPanelIntent,
  nextRegistration,
  statusNotice = null,
  historyRecord = null,
}) {
  const nextState = clearPlacementEditRuntime(replaceSession(replaceRegistration(state, nextRegistration), {
    mode: MACHINE_MODE.ALIGN,
  }));
  const panelTransition = settlePanel(sourceState, nextState);
  return createTransitionResult({
    state: panelTransition.state,
    effects: panelTransition.effects,
    statusNotice,
    historyRecord,
  });
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
  return createSemanticHistoryRecord({
    kind,
    label,
    undoLabel,
    redoLabel,
    undo: createRestoreRegistrationReplay(previousRegistration),
    redo: createRestoreRegistrationReplay(nextRegistration),
  });
}

function createRestoreRegistrationReplay(registration) {
  return {
    operation: MACHINE_HISTORY_REPLAY_OPERATION.RESTORE_REGISTRATION,
    registration,
    mode: MACHINE_MODE.ALIGN,
  };
}
