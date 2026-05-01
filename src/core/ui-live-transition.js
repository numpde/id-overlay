import {
  projectLiveUiState,
  syncPanelActionStateToUiIntent,
} from "./ui-live-state.js";
import { transitionUiState } from "./ui-transition.js";

export function transitionLiveUi({
  state,
  panelActionState,
  runtime,
  event,
}) {
  const previousUiState = projectLiveUiState({
    state,
    panelActionState,
    runtime,
  });
  const transitionResult = transitionUiState(previousUiState, event);
  const nextUiState = transitionResult.state;
  const nextPanelActionState = syncPanelActionStateToUiIntent({
    previousPanelActionState: panelActionState,
    nextIntent: nextUiState.panel.intent,
  });

  return {
    previousUiState,
    transitionResult,
    nextUiState,
    nextPanelActionState,
  };
}
