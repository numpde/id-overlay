import {
  UI_EFFECT_KIND,
} from "./ui-effect-model.js";
import {
  UI_PANEL_INTENT_KIND,
  createInitialUiState,
  UI_MODE_KIND,
} from "./ui-state-model.js";
import {
  PANEL_ACTION_EVENT,
  reducePanelActionState,
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
    status: {
      messageOverride: null,
    },
  };
}

export function syncPanelActionStateToUiIntent({
  previousPanelActionState,
  nextIntent,
}) {
  if (previousPanelActionState?.kind === nextIntent) {
    return previousPanelActionState;
  }

  switch (nextIntent) {
    case UI_PANEL_INTENT_KIND.IDLE:
      return reducePanelActionState(
        previousPanelActionState,
        previousPanelActionState?.kind === UI_PANEL_INTENT_KIND.PASTE_ARMED
          ? PANEL_ACTION_EVENT.CANCEL_PASTE
          : PANEL_ACTION_EVENT.RESET,
      );
    case UI_PANEL_INTENT_KIND.PASTE_ARMED:
      return reducePanelActionState(
        previousPanelActionState,
        PANEL_ACTION_EVENT.ARM_PASTE,
      );
    case UI_PANEL_INTENT_KIND.CLEAR_PINS_CONFIRM:
      return reducePanelActionState(
        previousPanelActionState,
        PANEL_ACTION_EVENT.ARM_CLEAR_PINS_CONFIRM,
      );
    case UI_PANEL_INTENT_KIND.CLEAR_IMAGE_CONFIRM:
      return reducePanelActionState(
        previousPanelActionState,
        PANEL_ACTION_EVENT.ARM_CLEAR_IMAGE_CONFIRM,
      );
    default:
      return previousPanelActionState;
  }
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
