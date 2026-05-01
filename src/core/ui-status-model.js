import { isTraceMode } from "./interaction-mode.js";
import { UI_PANEL_INTENT_KIND } from "./ui-state-model.js";
import { resolveOverlayRenderState } from "./transform.js";
import { resolveRegistrationSolveState } from "./state.js";
import { UI_ACTIVE_GESTURE_KIND, UI_INPUT_OVERRIDE_KIND } from "./ui-state-model.js";

export const MANUAL_PASTE_PROMPT = "Press Ctrl/Cmd+V to paste an image from your clipboard.";
export const CLEAR_PINS_CONFIRMATION_MESSAGE = "Click Clear pins? again to remove the current registration pins.";
export const CLEAR_IMAGE_CONFIRMATION_MESSAGE = "Click Clear image? again to remove the current screenshot, placement, and pins.";
export const DIRTY_PINS_STATUS_MESSAGE = "Align mode: pins changed. Switch to Trace to fit the overlay from the current pins.";

export function resolveUiStatusBaseline({ uiState }) {
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

  if (uiState.runtime.inputOverride === UI_INPUT_OVERRIDE_KIND.PASS_THROUGH) {
    return "Pass-through active: pan or zoom iD underneath, then release Space to continue registering.";
  }

  if (uiState.runtime.activeGesture) {
    return describeActiveAlignDrag(uiState.runtime.activeGesture) ?? "Dragging overlay.";
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
  if (dragMode === UI_ACTIVE_GESTURE_KIND.MAP_PAN) {
    return "Panning the map while the overlay follows.";
  }
  if (dragMode === UI_ACTIVE_GESTURE_KIND.MOVE_OVERLAY) {
    return "Dragging overlay only. Release to keep this placement.";
  }
  return null;
}
