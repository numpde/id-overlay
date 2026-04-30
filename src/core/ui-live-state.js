import {
  UI_EFFECT_KIND,
} from "./ui-effect-model.js";
import {
  UI_PANEL_INTENT_KIND,
  createInitialUiState,
  UI_MODE_KIND,
} from "./ui-state-model.js";
import {
  syncPanelActionState,
} from "./panel-state.js";

export function projectLiveUiState({
  state,
  panelActionState,
}) {
  const initialUiState = createInitialUiState();
  return {
    ...initialUiState,
    session: {
      ...initialUiState.session,
      mode: state?.mode ?? initialUiState.session.mode,
      opacity: state?.opacity ?? initialUiState.session.opacity,
      image: state?.image ?? null,
      placement: state?.placement ?? null,
      registration: {
        ...initialUiState.session.registration,
        ...state?.registration,
      },
    },
    panel: {
      intent: panelActionState?.kind ?? UI_PANEL_INTENT_KIND.IDLE,
    },
  };
}

export function syncPanelActionStateToUiIntent({
  previousPanelActionState,
  nextIntent,
}) {
  return syncPanelActionState(previousPanelActionState, nextIntent);
}

export function resolveUiModeExecution({
  previousUiState,
  nextUiState,
  effects,
}) {
  const requestSolve = effects.includes(UI_EFFECT_KIND.REQUEST_REGISTRATION_SOLVE);
  const nextMode = nextUiState?.session?.mode ?? previousUiState?.session?.mode;
  const previousMode = previousUiState?.session?.mode ?? UI_MODE_KIND.TRACE;
  if (previousMode === nextMode && !requestSolve) {
    return null;
  }

  return {
    nextMode,
    requestSolve,
  };
}
