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

  // Final semantic-history shape: clear-pins should be committed here as the
  // semantic transition, with undo/redo events that restore/clear pins through
  // this reducer. The CLEAR_PINS effect and imperative interaction duplicate
  // should disappear.
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
      // Final semantic-history shape: timer cancellation is still an external
      // scheduling effect, but the durable clear must not also be a live effect.
      UI_EFFECT_KIND.CANCEL_PANEL_TIMEOUT,
      UI_EFFECT_KIND.CLEAR_PINS,
    ],
  );
}
