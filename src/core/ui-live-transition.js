import {
  projectLiveUiState,
} from "./ui-live-state.js";
import { syncPanelActionState } from "./panel-state.js";
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
  const nextPanelActionState = syncPanelActionState(
    panelActionState,
    transitionResult.state.panel.intent,
  );

  return {
    previousUiState,
    transitionResult,
    nextPanelActionState,
  };
}
