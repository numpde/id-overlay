import {
  UI_PANEL_INTENT_KIND,
  createInitialUiState,
  UI_ACTIVE_GESTURE_KIND,
  UI_INPUT_OVERRIDE_KIND,
} from "./ui-state-model.js";
import {
  getRuntimeDragMode,
  getRuntimePointerScreenPx,
  isRuntimePassThroughActive,
} from "./interaction-runtime.js";

export function projectLiveUiState({
  state,
  panelActionState,
  runtime,
}) {
  const initialUiState = createInitialUiState();
  // Final semantic-history shape: if undo/redo records live in UI state, this
  // projection should receive them explicitly from the transition machine.
  // Do not derive pending history controls from store snapshot descriptors.
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

export function projectLiveUiRuntime(runtime) {
  const activeGesture = (
    getRuntimeDragMode(runtime) === "map-pan"
      ? UI_ACTIVE_GESTURE_KIND.MAP_PAN
      : getRuntimeDragMode(runtime) === "move-overlay"
        ? UI_ACTIVE_GESTURE_KIND.MOVE_OVERLAY
        : null
  );
  const inputOverride = isRuntimePassThroughActive(runtime)
    ? UI_INPUT_OVERRIDE_KIND.PASS_THROUGH
    : null;

  return {
    pointer: {
      screenPx: getRuntimePointerScreenPx(runtime),
    },
    activeGesture,
    inputOverride,
  };
}
