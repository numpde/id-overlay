import { MACHINE_EFFECT_RESULT_KIND } from "./effects.js";
import { completePasteRead } from "./paste-outcome.js";
import {
  canCancelPanelIntent,
  cancelPanelIntent,
  clearStatusNotice,
} from "./panel-status-transition.js";
import {
  createInitialMachineState,
  normalizeMachineState,
} from "./state.js";
import {
  createTransitionResult,
  finalizeTransitionResult,
} from "./transition-result.js";

export function transitionMachineEffectResult(state = createInitialMachineState(), result = {}) {
  return finalizeTransitionResult(transitionEffectResult(
    normalizeMachineState(state),
    result,
  ), {
    commitHistory: true,
    commitStatus: true,
  });
}

function transitionEffectResult(state, result) {
  switch (result?.kind) {
    case MACHINE_EFFECT_RESULT_KIND.READ_PASTE_IMAGE:
      return completePasteRead(state, result);
    case MACHINE_EFFECT_RESULT_KIND.PANEL_TIMEOUT_ELAPSED:
      if (!canCancelPanelIntent(state, result)) {
        return createTransitionResult({ state });
      }
      return cancelPanelIntent(state, result);
    case MACHINE_EFFECT_RESULT_KIND.STATUS_TIMEOUT_ELAPSED:
      return clearStatusNotice(state, result);
    default:
      return createTransitionResult({ state });
  }
}
