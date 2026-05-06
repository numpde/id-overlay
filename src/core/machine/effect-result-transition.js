import { PASTE_EFFECT_RESULT_TRANSITIONS } from "./paste-outcome.js";
import { PANEL_STATUS_EFFECT_RESULT_TRANSITIONS } from "./panel-status-transition.js";
import {
  createInitialMachineState,
  normalizeMachineState,
} from "./state.js";
import {
  createTransitionResult,
  withHistoryRecord,
  withStatusNotice,
} from "./transition-result.js";

const EFFECT_RESULT_TRANSITIONS = {
  ...PASTE_EFFECT_RESULT_TRANSITIONS,
  ...PANEL_STATUS_EFFECT_RESULT_TRANSITIONS,
};

export function transitionMachineEffectResult(state = createInitialMachineState(), result = {}) {
  return withStatusNotice(withHistoryRecord(transitionEffectResult(
    normalizeMachineState(state),
    result,
  )));
}

function transitionEffectResult(state, result) {
  return (
    EFFECT_RESULT_TRANSITIONS[result?.kind]?.(state, result) ??
    createTransitionResult({ state })
  );
}
