import {
  UI_PANEL_INTENT_KIND,
  createInitialUiState,
  UI_ACTIVE_GESTURE_KIND,
  UI_INPUT_OVERRIDE_KIND,
} from "./ui-state-model.js";
import {
  syncPanelActionState,
} from "./panel-state.js";

export function projectLiveUiState({
  state,
  panelActionState,
  runtime,
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
    runtime: projectLiveUiRuntime(runtime),
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

export function projectLiveUiRuntime(runtime) {
  const activeGesture = (
    runtime?.dragMode === "map-pan"
      ? UI_ACTIVE_GESTURE_KIND.MAP_PAN
      : runtime?.dragMode === "move-overlay"
        ? UI_ACTIVE_GESTURE_KIND.MOVE_OVERLAY
        : null
  );
  const inputOverride = runtime?.isPassThroughActive
    ? UI_INPUT_OVERRIDE_KIND.PASS_THROUGH
    : null;

  return {
    pointer: {
      screenPx: runtime?.pointerScreenPx ?? null,
    },
    activeGesture,
    inputOverride,
  };
}
