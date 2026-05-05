import {
  MACHINE_COMMAND_KIND,
} from "./private-commands.js";
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
  withHistoryRecord,
  withStatusNotice,
} from "./transition-result.js";

export function transitionMachine(state = createInitialMachineState(), event = {}) {
  const currentState = normalizeMachineState(state);
  return withStatusNotice(withHistoryRecord(interpretIngressEvent(currentState, event)));
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
  [MACHINE_COMMAND_KIND.UNDO]: transitionUndo,
  [MACHINE_COMMAND_KIND.REDO]: transitionRedo,
});

const transitionSession = Object.freeze({
  [MACHINE_COMMAND_KIND.LOAD_IMAGE]: loadImage,
  [MACHINE_COMMAND_KIND.CLEAR_IMAGE]: clearImage,
  [MACHINE_COMMAND_KIND.RESTORE_IMAGE_SESSION]: restoreImageSession,
  [MACHINE_COMMAND_KIND.SELECT_MODE]: selectMode,
  [MACHINE_COMMAND_KIND.SET_OPACITY]: setOpacity,
});

const transitionRuntime = Object.freeze({
  [MACHINE_COMMAND_KIND.UPDATE_POINTER_RUNTIME]: updatePointerRuntime,
  [MACHINE_COMMAND_KIND.BEGIN_POINTER_GESTURE]: beginPointerGesture,
  [MACHINE_COMMAND_KIND.END_POINTER_GESTURE]: endPointerGesture,
  [MACHINE_COMMAND_KIND.SET_INPUT_OVERRIDE]: setInputOverride,
  [MACHINE_COMMAND_KIND.RESET_INPUT_RUNTIME]: resetInputRuntime,
});

const transitionRegistration = Object.freeze({
  [MACHINE_COMMAND_KIND.TOGGLE_PIN]: togglePin,
  [MACHINE_COMMAND_KIND.ADD_PIN]: addPin,
  [MACHINE_COMMAND_KIND.REMOVE_PIN]: removePin,
  [MACHINE_COMMAND_KIND.CLEAR_PINS]: clearPins,
  [MACHINE_COMMAND_KIND.RESTORE_REGISTRATION]: restoreRegistration,
  [MACHINE_COMMAND_KIND.FIT_OVERLAY]: fitOverlay,
});

const transitionPlacement = Object.freeze({
  [MACHINE_COMMAND_KIND.BEGIN_PLACEMENT_EDIT]: beginPlacementEdit,
  [MACHINE_COMMAND_KIND.PREVIEW_PLACEMENT_EDIT]: previewPlacementEdit,
  [MACHINE_COMMAND_KIND.COMMIT_PLACEMENT_EDIT]: commitPlacementEdit,
  [MACHINE_COMMAND_KIND.CANCEL_PLACEMENT_EDIT]: cancelPlacementEdit,
  [MACHINE_COMMAND_KIND.APPLY_PLACEMENT_EDIT]: applyPlacementEdit,
  [MACHINE_COMMAND_KIND.RESTORE_PLACEMENT]: restorePlacement,
});

const transitionPanelStatus = Object.freeze({
  [MACHINE_COMMAND_KIND.REQUEST_PANEL_INTENT]: requestPanelIntent,
  [MACHINE_COMMAND_KIND.CANCEL_PANEL_INTENT]: transitionPanelCancelIntent,
  [MACHINE_COMMAND_KIND.REPORT_STATUS_NOTICE]: reportStatusNotice,
  [MACHINE_COMMAND_KIND.CLEAR_STATUS_NOTICE]: clearStatusNotice,
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
