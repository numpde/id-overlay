import {
  MACHINE_EVENT_KIND,
  MACHINE_HISTORY_KIND,
  MACHINE_MODE,
  MACHINE_STATUS_NOTICE_KIND,
} from "./events.js";
import {
  createEmptyRegistration,
  replaceRegistration,
  replaceSession,
} from "./state.js";
import {
  createInvalidatedRegistration,
} from "../session.js";
import { solveSimilarityTransform } from "../geometry.js";
import { selectPanelPolicy } from "./policy.js";
import {
  clearInvalidPanelIntent,
  clearPanelIntent,
} from "./panel-status-transition.js";
import { clearPlacementEditRuntime } from "./placement-transition.js";
import { resetInputRuntimeState } from "./runtime-transition.js";
import {
  createStatusNotice,
  createTransitionResult,
} from "./transition-result.js";

export function togglePin(state, event) {
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

export function addPin(state, event) {
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

export function removePin(state, event) {
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

export function clearPins(state, event = {}) {
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

export function restoreRegistration(state, event) {
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

export function fitOverlay(state) {
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
