import { UI_EFFECT_KIND } from "./ui-effect-model.js";
import { UI_EVENT_KIND } from "./ui-event-model.js";
import { UI_PANEL_INTENT_KIND } from "./ui-state-model.js";
import { createUiTransitionResult } from "./ui-transition-result.js";

// Final semantic-history shape: this reducer should own undo/redo as normal
// state-machine transitions. It should pop/push semantic history records and
// dispatch their undoEvent/redoEvent through transitionUiState, not emit
// UNDO_SESSION/REDO_SESSION effects that bypass reducer semantics.
export function transitionHistory(uiState, event) {
  switch (event?.kind) {
    case UI_EVENT_KIND.UNDO_TRIGGERED:
      return transitionHistoryCommand(uiState, UI_EFFECT_KIND.UNDO_SESSION);
    case UI_EVENT_KIND.REDO_TRIGGERED:
      return transitionHistoryCommand(uiState, UI_EFFECT_KIND.REDO_SESSION);
    default:
      return createUiTransitionResult(uiState);
  }
}

function transitionHistoryCommand(uiState, effectKind) {
  // Final semantic-history shape: clearing transient panel intent before
  // history execution is valid, but it should be expressed as part of the
  // semantic undo/redo transition record consumption, not as a generic command
  // effect wrapper.
  const nextState = uiState.panel.intent === UI_PANEL_INTENT_KIND.IDLE
    ? uiState
    : {
      ...uiState,
      panel: {
        ...uiState.panel,
        intent: UI_PANEL_INTENT_KIND.IDLE,
      },
    };

  return createUiTransitionResult(nextState, [
    UI_EFFECT_KIND.CANCEL_PANEL_TIMEOUT,
    effectKind,
  ]);
}
