import { isTraceMode } from "./interaction-mode.js";
import { DRAG_MODE } from "./interaction-policy.js";
import { UI_PANEL_INTENT_KIND } from "./ui-state-model.js";
import { resolveOverlayRenderState } from "./transform.js";
import { resolveRegistrationSolveState } from "./state.js";

export const MANUAL_PASTE_PROMPT = "Press Ctrl/Cmd+V to paste an image from your clipboard.";
export const CLEAR_PINS_CONFIRMATION_MESSAGE = "Click Clear pins? again to remove the current registration pins.";
export const CLEAR_IMAGE_CONFIRMATION_MESSAGE = "Click Clear image? again to remove the current screenshot, placement, and pins.";
export const DIRTY_PINS_STATUS_MESSAGE = "Align mode: pins changed. Switch to Trace to fit the overlay from the current pins.";

export function resolveUiStatusBaseline({ uiState, runtime }) {
  const intent = uiState.panel.intent;
  if (intent === UI_PANEL_INTENT_KIND.PASTE_ARMED) {
    return MANUAL_PASTE_PROMPT;
  }
  if (intent === UI_PANEL_INTENT_KIND.CLEAR_PINS_CONFIRM) {
    return CLEAR_PINS_CONFIRMATION_MESSAGE;
  }
  if (intent === UI_PANEL_INTENT_KIND.CLEAR_IMAGE_CONFIRM) {
    return CLEAR_IMAGE_CONFIRMATION_MESSAGE;
  }

  if (!uiState.session.image) {
    return "Paste a screenshot to begin.";
  }

  if (runtime?.isPassThroughActive) {
    return "Pass-through active: pan or zoom iD underneath, then release Space to continue registering.";
  }

  if (runtime?.isDragging) {
    return describeActiveAlignDrag(runtime.dragMode) ?? "Dragging overlay.";
  }

  const solveState = resolveRegistrationSolveState(uiState.session.registration);
  if (solveState.kind === "dirty") {
    return DIRTY_PINS_STATUS_MESSAGE;
  }

  const renderState = resolveOverlayRenderState(uiState.session);
  if (renderState.source === "solved") {
    return isTraceMode(uiState.session.mode)
      ? "Trace mode: the overlay follows the map using the solved transform."
      : "Align mode: solved transform preview active. Switch to Trace to verify map-following, or adjust placement to refine and recompute.";
  }

  if (isTraceMode(uiState.session.mode)) {
    return "Trace mode: the overlay follows the map using the current manual placement.";
  }

  return describeAlignGestureContract();
}

export function describeAlignGestureContract() {
  return "Align mode: drag to move map and overlay together, Shift+drag to move only the overlay, wheel to zoom both, Shift+wheel to scale only the overlay, Ctrl+wheel to rotate the overlay, Alt+wheel to adjust opacity, double-click to add/remove pins, then switch to Trace to fit the overlay.";
}

export function describeActiveAlignDrag(dragMode) {
  if (dragMode === DRAG_MODE.MAP_PAN) {
    return "Panning the map while the overlay follows.";
  }
  if (dragMode === DRAG_MODE.MOVE_OVERLAY) {
    return "Dragging overlay only. Release to keep this placement.";
  }
  return null;
}
