import { MACHINE_EFFECT_RESULT_KIND } from "./effects.js";
import { completePasteRead } from "./paste-outcome.js";
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
    default:
      return createTransitionResult({ state });
  }
}
