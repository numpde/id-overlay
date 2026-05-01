import { UI_EFFECT_KIND } from "./ui-effect-model.js";
import { UI_EVENT_KIND } from "./ui-event-model.js";
import { UI_PANEL_INTENT_KIND } from "./ui-state-model.js";
import { createUiTransitionResult } from "./ui-transition-result.js";
import {
  resolveSessionRegistrationAffordances,
} from "./ui-registration-semantics.js";
import { createDefaultRegistration } from "./state.js";

export function transitionRegistration(uiState, event) {
  switch (event?.kind) {
    case UI_EVENT_KIND.CLEAR_PINS_TRIGGERED:
      return transitionClearPins(uiState);
    default:
      return createUiTransitionResult(uiState);
  }
}

export function transitionClearPins(uiState) {
  if (!resolveSessionRegistrationAffordances(uiState.session).canClearPins) {
    return createUiTransitionResult(uiState);
  }

  return createUiTransitionResult(
    {
      ...uiState,
      session: {
        ...uiState.session,
        registration: createDefaultRegistration(),
      },
      panel: {
        ...uiState.panel,
        intent: UI_PANEL_INTENT_KIND.IDLE,
      },
    },
    [
      UI_EFFECT_KIND.CANCEL_PANEL_TIMEOUT,
      UI_EFFECT_KIND.CLEAR_PINS,
    ],
  );
}
