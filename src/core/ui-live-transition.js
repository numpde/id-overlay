import { UI_EVENT_KIND } from "./ui-event-model.js";
import { UI_PANEL_INTENT_KIND } from "./ui-state-model.js";
import {
  projectLiveUiState,
  resolveUiModeExecution,
  syncPanelActionStateToUiIntent,
} from "./ui-live-state.js";
import { transitionUiState } from "./ui-transition.js";

export const UI_LIVE_FEEDBACK_KIND = Object.freeze({
  PASTE_CANCELLED: "paste-cancelled",
});

export function transitionLiveUi({
  state,
  panelActionState,
  event,
}) {
  const previousUiState = projectLiveUiState({
    state,
    panelActionState,
  });
  const transitionResult = transitionUiState(previousUiState, event);
  const nextUiState = transitionResult.state;
  const nextPanelActionState = syncPanelActionStateToUiIntent({
    previousPanelActionState: panelActionState,
    nextIntent: nextUiState.panel.intent,
  });
  const modeExecution = resolveUiModeExecution({
    previousUiState,
    nextUiState,
    effects: transitionResult.effects,
  });

  return {
    previousUiState,
    transitionResult,
    nextUiState,
    nextPanelActionState,
    modeExecution,
    feedbackKind: resolveUiLiveFeedbackKind({
      event,
      previousUiState,
      nextUiState,
    }),
  };
}

function resolveUiLiveFeedbackKind({
  event,
  previousUiState,
  nextUiState,
}) {
  if (
    event?.kind === UI_EVENT_KIND.MAIN_ACTION_TRIGGERED &&
    previousUiState.panel.intent === UI_PANEL_INTENT_KIND.PASTE_ARMED &&
    nextUiState.panel.intent === UI_PANEL_INTENT_KIND.IDLE
  ) {
    return UI_LIVE_FEEDBACK_KIND.PASTE_CANCELLED;
  }
  return null;
}
