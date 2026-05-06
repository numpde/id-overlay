import { PASTE_EFFECT_RESULT_TRANSITIONS } from "./paste-outcome.js";
import { PANEL_STATUS_EFFECT_RESULT_TRANSITIONS } from "./panel-status-transition.js";
import {
  createInitialMachineState,
  normalizeMachineState,
} from "./state.js";
import { commitSemanticHistoryRecord } from "./history.js";
import { applyMachineStatusNotice } from "./panel-status-transition.js";
import {
  createTransitionResult,
} from "./transition-result.js";

const EFFECT_RESULT_TRANSITIONS = {
  ...PASTE_EFFECT_RESULT_TRANSITIONS,
  ...PANEL_STATUS_EFFECT_RESULT_TRANSITIONS,
};

export function transitionMachineEffectResult(state = createInitialMachineState(), result = {}) {
  return applyMachineStatusNotice(
    commitSemanticHistoryRecord(transitionEffectResult(
      normalizeMachineState(state),
      result,
    )),
  );
}

function transitionEffectResult(state, result) {
  return (
    EFFECT_RESULT_TRANSITIONS[result?.kind]?.(state, result) ??
    createTransitionResult({ state })
  );
}
