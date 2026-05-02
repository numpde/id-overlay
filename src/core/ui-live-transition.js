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
  // TODO(machine-cutover): Delete this reconciliation bridge when live code
  // dispatches directly to the machine host.
  // Final semantic-history shape: once panel intent lives in canonical UI
  // state, this reconciliation step should disappear. transitionUiState should
  // return the complete next machine state directly.
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
