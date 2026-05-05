import {
  MACHINE_EVENT_KIND,
} from "./events.js";
import {
  createInitialMachineState,
  normalizeMachineState,
} from "./state.js";
import {
  transitionRedo,
  transitionUndo,
} from "./history-replay-transition.js";
import {
  addPin,
  clearPins,
  fitOverlay,
  removePin,
  restoreRegistration,
  togglePin,
} from "./registration-transition.js";
import {
  applyPlacementEdit,
  beginPlacementEdit,
  cancelPlacementEdit,
  commitPlacementEdit,
  previewPlacementEdit,
  restorePlacement,
} from "./placement-transition.js";
import {
  beginPointerGesture,
  endPointerGesture,
  resetInputRuntime,
  setInputOverride,
  updatePointerRuntime,
} from "./runtime-transition.js";
import {
  clearImage,
  loadImage,
  restoreImageSession,
  selectMode,
  setOpacity,
} from "./session-transition.js";
import {
  canCancelPanelIntent,
  cancelPanelIntent,
  clearStatusNotice,
  reportStatusNotice,
  requestPanelIntent,
} from "./panel-status-transition.js";
import {
  createTransitionResult,
  finalizeTransitionResult,
} from "./transition-result.js";
import { completePasteRead } from "./paste-outcome.js";

export function transitionMachine(state = createInitialMachineState(), event = {}) {
  const currentState = normalizeMachineState(state);
  if (event.type === MACHINE_EVENT_KIND.UNDO) {
    return transitionUndo(currentState, { transitionSemantic });
  }
  if (event.type === MACHINE_EVENT_KIND.REDO) {
    return transitionRedo(currentState, { transitionSemantic });
  }
  return finalizeTransitionResult(transitionSemantic(currentState, event), {
    commitHistory: true,
    commitStatus: true,
  });
}

function transitionSemantic(state, event) {
  // TODO(smell): This dispatcher treats externally-authored user actions and
  // internal mutation/replay commands as one flat event space. The final shape
  // should route public ingress events through semantic interpreters and keep
  // direct domain mutation events private to machine-owned transitions/history.
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
    case MACHINE_EVENT_KIND.COMPLETE_PASTE_READ:
      return completePasteRead(state, event);
    default:
      return createTransitionResult({
        state,
      });
  }
}
