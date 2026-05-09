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
  replaceSession,
} from "./state.js";
import { solveSimilarityTransform } from "../geometry.js";
import { selectPanelPolicy } from "./policy.js";
import {
  clearInvalidPanelIntent,
} from "./panel-status-transition.js";
import { clearPlacementEditRuntime } from "./placement-edit-runtime-transition.js";
import { resetInputRuntimeState } from "./runtime-transition.js";
import {
  createTransitionResult,
} from "./transition-result.js";
import {
  applyAddPinEdit,
  applyClearPinsEdit,
  applyRemovePinEdit,
} from "./registration-edit-transition.js";

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
    return applyRemovePinEdit(state, {
      ...event,
      id: existingPin.id,
    });
  }
  return applyAddPinEdit(state, {
    ...event,
    imagePx: event.imagePx,
    mapLatLon: event.mapLatLon,
  });
}

export function clearPins(state, event = {}) {
  return applyClearPinsEdit(state, event);
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
    historyRecord: createSemanticHistoryRecord({
      kind: MACHINE_HISTORY_KIND.FIT_OVERLAY,
      label: "Fit overlay from pins",
      undoLabel: "Undo fit overlay",
      redoLabel: "Fit overlay from pins",
      undo: {
        operation: MACHINE_HISTORY_REPLAY_OPERATION.RESTORE_IMAGE_SESSION,
        session: previousSession,
      },
      redo: {
        operation: MACHINE_HISTORY_REPLAY_OPERATION.RESTORE_IMAGE_SESSION,
        session: nextSession,
      },
    }),
  });
}

function canEditPins(state) {
  return selectPanelPolicy(state).canEditOverlay;
}
