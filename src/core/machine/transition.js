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

export function transitionMachine(state = createInitialMachineState(), event = {}) {
  const currentState = normalizeMachineState(state);
  return finalizeTransitionResult(interpretIngressEvent(currentState, event), {
    commitHistory: true,
    commitStatus: true,
  });
}

function interpretIngressEvent(state, event) {
  // TODO(smell): Ingress is now grouped by domain, but the event vocabulary
  // still mixes public user facts with private mutation/replay commands. Split
  // those vocabularies once history records stop storing executable events.
  const transitionHistory = transitionHistoryIngress[event?.type];
  if (transitionHistory) {
    return transitionHistory(state);
  }

  const transitionDomain = transitionDomainCommand[event?.type];
  if (!transitionDomain) {
    return createTransitionResult({
      state,
    });
  }
  return transitionDomain(state, event);
}

const transitionHistoryIngress = Object.freeze({
  [MACHINE_EVENT_KIND.UNDO]: transitionUndo,
  [MACHINE_EVENT_KIND.REDO]: transitionRedo,
});

const transitionSession = Object.freeze({
  [MACHINE_EVENT_KIND.LOAD_IMAGE]: loadImage,
  [MACHINE_EVENT_KIND.CLEAR_IMAGE]: clearImage,
  [MACHINE_EVENT_KIND.RESTORE_IMAGE_SESSION]: restoreImageSession,
  [MACHINE_EVENT_KIND.SELECT_MODE]: selectMode,
  [MACHINE_EVENT_KIND.SET_OPACITY]: setOpacity,
});

const transitionRuntime = Object.freeze({
  [MACHINE_EVENT_KIND.UPDATE_POINTER_RUNTIME]: updatePointerRuntime,
  [MACHINE_EVENT_KIND.BEGIN_POINTER_GESTURE]: beginPointerGesture,
  [MACHINE_EVENT_KIND.END_POINTER_GESTURE]: endPointerGesture,
  [MACHINE_EVENT_KIND.SET_INPUT_OVERRIDE]: setInputOverride,
  [MACHINE_EVENT_KIND.RESET_INPUT_RUNTIME]: resetInputRuntime,
});

const transitionRegistration = Object.freeze({
  [MACHINE_EVENT_KIND.TOGGLE_PIN]: togglePin,
  [MACHINE_EVENT_KIND.ADD_PIN]: addPin,
  [MACHINE_EVENT_KIND.REMOVE_PIN]: removePin,
  [MACHINE_EVENT_KIND.CLEAR_PINS]: clearPins,
  [MACHINE_EVENT_KIND.RESTORE_REGISTRATION]: restoreRegistration,
  [MACHINE_EVENT_KIND.FIT_OVERLAY]: fitOverlay,
});

const transitionPlacement = Object.freeze({
  [MACHINE_EVENT_KIND.BEGIN_PLACEMENT_EDIT]: beginPlacementEdit,
  [MACHINE_EVENT_KIND.PREVIEW_PLACEMENT_EDIT]: previewPlacementEdit,
  [MACHINE_EVENT_KIND.COMMIT_PLACEMENT_EDIT]: commitPlacementEdit,
  [MACHINE_EVENT_KIND.CANCEL_PLACEMENT_EDIT]: cancelPlacementEdit,
  [MACHINE_EVENT_KIND.APPLY_PLACEMENT_EDIT]: applyPlacementEdit,
  [MACHINE_EVENT_KIND.RESTORE_PLACEMENT]: restorePlacement,
});

const transitionPanelStatus = Object.freeze({
  [MACHINE_EVENT_KIND.REQUEST_PANEL_INTENT]: requestPanelIntent,
  [MACHINE_EVENT_KIND.CANCEL_PANEL_INTENT]: transitionPanelCancelIntent,
  [MACHINE_EVENT_KIND.REPORT_STATUS_NOTICE]: reportStatusNotice,
  [MACHINE_EVENT_KIND.CLEAR_STATUS_NOTICE]: clearStatusNotice,
});

const transitionDomainCommand = Object.freeze({
  ...transitionSession,
  ...transitionRuntime,
  ...transitionRegistration,
  ...transitionPlacement,
  ...transitionPanelStatus,
});

function transitionPanelCancelIntent(state, event) {
  if (!canCancelPanelIntent(state, event)) {
    return createTransitionResult({
      state,
    });
  }
  return cancelPanelIntent(state, event);
}
