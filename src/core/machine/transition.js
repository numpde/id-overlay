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
  commitPlacementEdit,
} from "./placement-transition.js";
import {
  beginPlacementEdit,
  previewPlacementEdit,
} from "./placement-edit-runtime-transition.js";
import {
  clearImage,
  loadImage,
  selectMode,
  setOpacity,
} from "./session-transition.js";
import {
  canCancelPanelIntent,
  cancelPanelIntent,
  applyMachineStatusNotice,
  requestPanelIntent,
} from "./panel-status-transition.js";
import {
  createTransitionResult,
} from "./transition-result.js";

export function transitionActivateUndo(state = createInitialMachineState()) {
  return commitMachineTransition(state, transitionUndo);
}

export function transitionActivateRedo(state = createInitialMachineState()) {
  return commitMachineTransition(state, transitionRedo);
}

export function transitionLoadImage(state = createInitialMachineState(), payload = {}) {
  return commitMachineTransition(state, loadImage, payload);
}

export function transitionClearImage(state = createInitialMachineState()) {
  return commitMachineTransition(state, clearImage);
}

export function transitionSelectMode(state = createInitialMachineState(), payload = {}) {
  return commitMachineTransition(state, selectMode, payload);
}

export function transitionSetOpacity(state = createInitialMachineState(), payload = {}) {
  return commitMachineTransition(state, setOpacity, payload);
}

export function transitionTogglePin(state = createInitialMachineState(), payload = {}) {
  return commitMachineTransition(state, togglePin, payload);
}

export function transitionClearPins(state = createInitialMachineState(), payload = {}) {
  return commitMachineTransition(state, clearPins, payload);
}

export function transitionFitOverlay(state = createInitialMachineState()) {
  return commitMachineTransition(state, fitOverlay);
}

export function transitionBeginPlacementEdit(state = createInitialMachineState(), payload = {}) {
  return commitMachineTransition(state, beginPlacementEdit, payload);
}

export function transitionPreviewPlacementEdit(state = createInitialMachineState(), payload = {}) {
  return commitMachineTransition(state, previewPlacementEdit, payload);
}

export function transitionCommitPlacementEdit(state = createInitialMachineState()) {
  return commitMachineTransition(state, commitPlacementEdit);
}

export function transitionApplyPlacementEdit(state = createInitialMachineState(), payload = {}) {
  return commitMachineTransition(state, applyPlacementEdit, payload);
}

export function transitionRequestPanelIntent(state = createInitialMachineState(), payload = {}) {
  return commitMachineTransition(state, requestPanelIntent, payload);
}

export function transitionCancelPanelIntent(state = createInitialMachineState(), payload = {}) {
  return commitMachineTransition(state, cancelPanelIntentIfCurrent, payload);
}

function commitMachineTransition(state, transition, payload = {}) {
  const currentState = normalizeMachineState(state);
  return applyMachineStatusNotice(
    commitSemanticHistoryRecord(transition(currentState, payload)),
  );
}

function cancelPanelIntentIfCurrent(state, payload) {
  if (!canCancelPanelIntent(state, payload)) {
    return createTransitionResult({
      state,
    });
  }
  return cancelPanelIntent(state, payload);
}
