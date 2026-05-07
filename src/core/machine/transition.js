import {
  MACHINE_PRIVATE_COMMAND_KIND,
} from "./private-commands.js";
import {
  createInitialMachineState,
  normalizeMachineState,
} from "./state.js";
import {
  transitionRedo,
  transitionUndo,
} from "./history-replay-transition.js";
import { commitSemanticHistoryRecord } from "./history.js";
import {
  clearPins,
  fitOverlay,
  togglePin,
} from "./registration-transition.js";
import {
  applyPlacementEdit,
  beginPlacementEdit,
  cancelPlacementEdit,
  commitPlacementEdit,
  previewPlacementEdit,
} from "./placement-transition.js";
import {
  clearImage,
  loadImage,
  selectMode,
  setOpacity,
} from "./session-transition.js";
import {
  canCancelPanelIntent,
  cancelPanelIntent,
  clearStatusNotice,
  applyMachineStatusNotice,
  requestPanelIntent,
} from "./panel-status-transition.js";
import {
  createTransitionResult,
} from "./transition-result.js";

export function transitionMachine(state = createInitialMachineState(), event = {}) {
  const currentState = normalizeMachineState(state);
  return applyMachineStatusNotice(
    commitSemanticHistoryRecord(interpretIngressEvent(currentState, event)),
  );
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
  [MACHINE_PRIVATE_COMMAND_KIND.UNDO]: transitionUndo,
  [MACHINE_PRIVATE_COMMAND_KIND.REDO]: transitionRedo,
});

const transitionSession = Object.freeze({
  [MACHINE_PRIVATE_COMMAND_KIND.LOAD_IMAGE]: loadImage,
  [MACHINE_PRIVATE_COMMAND_KIND.CLEAR_IMAGE]: clearImage,
  [MACHINE_PRIVATE_COMMAND_KIND.SELECT_MODE]: selectMode,
  [MACHINE_PRIVATE_COMMAND_KIND.SET_OPACITY]: setOpacity,
});

const transitionRegistration = Object.freeze({
  [MACHINE_PRIVATE_COMMAND_KIND.TOGGLE_PIN]: togglePin,
  [MACHINE_PRIVATE_COMMAND_KIND.CLEAR_PINS]: clearPins,
  [MACHINE_PRIVATE_COMMAND_KIND.FIT_OVERLAY]: fitOverlay,
});

const transitionPlacement = Object.freeze({
  [MACHINE_PRIVATE_COMMAND_KIND.BEGIN_PLACEMENT_EDIT]: beginPlacementEdit,
  [MACHINE_PRIVATE_COMMAND_KIND.PREVIEW_PLACEMENT_EDIT]: previewPlacementEdit,
  [MACHINE_PRIVATE_COMMAND_KIND.COMMIT_PLACEMENT_EDIT]: commitPlacementEdit,
  [MACHINE_PRIVATE_COMMAND_KIND.CANCEL_PLACEMENT_EDIT]: cancelPlacementEdit,
  [MACHINE_PRIVATE_COMMAND_KIND.APPLY_PLACEMENT_EDIT]: applyPlacementEdit,
});

const transitionPanelStatus = Object.freeze({
  [MACHINE_PRIVATE_COMMAND_KIND.REQUEST_PANEL_INTENT]: requestPanelIntent,
  [MACHINE_PRIVATE_COMMAND_KIND.CANCEL_PANEL_INTENT]: transitionPanelCancelIntent,
  [MACHINE_PRIVATE_COMMAND_KIND.CLEAR_STATUS_NOTICE]: clearStatusNotice,
});

const transitionDomainCommand = Object.freeze({
  ...transitionSession,
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
