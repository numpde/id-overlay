import { isTraceMode } from "./interaction-mode.js";
import { UI_PANEL_INTENT_KIND } from "./ui-state-model.js";
import { resolveOverlayRenderState } from "./transform.js";
import { resolveRegistrationSolveState } from "./state.js";
import { UI_ACTIVE_GESTURE_KIND, UI_INPUT_OVERRIDE_KIND } from "./ui-state-model.js";

export const UI_STATUS_CASE = Object.freeze({
  PANEL_PASTE_ARMED: "panel-paste-armed",
  PANEL_CLEAR_PINS_CONFIRM: "panel-clear-pins-confirm",
  PANEL_CLEAR_IMAGE_CONFIRM: "panel-clear-image-confirm",
  EMPTY_SESSION: "empty-session",
  PASS_THROUGH: "pass-through",
  ACTIVE_MAP_PAN: "active-map-pan",
  ACTIVE_OVERLAY_DRAG: "active-overlay-drag",
  ACTIVE_UNKNOWN_DRAG: "active-unknown-drag",
  ALIGN_REGISTRATION_NEEDS_FIT: "align-registration-needs-fit",
  TRACE_REGISTRATION_NEEDS_FIT: "trace-registration-needs-fit",
  TRACE_SOLVED: "trace-solved",
  ALIGN_SOLVED_PREVIEW: "align-solved-preview",
  TRACE_MANUAL: "trace-manual",
  ALIGN_READY: "align-ready",
});

const STATUS_CASE_BY_PANEL_INTENT = Object.freeze({
  [UI_PANEL_INTENT_KIND.PASTE_ARMED]: UI_STATUS_CASE.PANEL_PASTE_ARMED,
  [UI_PANEL_INTENT_KIND.CLEAR_PINS_CONFIRM]: UI_STATUS_CASE.PANEL_CLEAR_PINS_CONFIRM,
  [UI_PANEL_INTENT_KIND.CLEAR_IMAGE_CONFIRM]: UI_STATUS_CASE.PANEL_CLEAR_IMAGE_CONFIRM,
});

const STATUS_MESSAGE_BY_CASE = Object.freeze({
  [UI_STATUS_CASE.PANEL_PASTE_ARMED]: "Press Ctrl/Cmd+V to paste an image from your clipboard.",
  [UI_STATUS_CASE.PANEL_CLEAR_PINS_CONFIRM]: "Click Clear pins? again to remove the current registration pins.",
  [UI_STATUS_CASE.PANEL_CLEAR_IMAGE_CONFIRM]: "Click Clear image? again to remove the current screenshot, placement, and pins.",
  [UI_STATUS_CASE.EMPTY_SESSION]: "Paste a screenshot to begin.",
  [UI_STATUS_CASE.PASS_THROUGH]: "Pass-through active: pan or zoom iD underneath, then release Space to continue registering.",
  [UI_STATUS_CASE.ACTIVE_MAP_PAN]: "Panning the map while the overlay follows.",
  [UI_STATUS_CASE.ACTIVE_OVERLAY_DRAG]: "Dragging overlay only. Release to keep this placement.",
  [UI_STATUS_CASE.ACTIVE_UNKNOWN_DRAG]: "Dragging overlay.",
  [UI_STATUS_CASE.ALIGN_REGISTRATION_NEEDS_FIT]: "Switch to Trace to fit the overlay from the current pins.",
  [UI_STATUS_CASE.TRACE_REGISTRATION_NEEDS_FIT]: "Fitting overlay from pins…",
  [UI_STATUS_CASE.TRACE_SOLVED]: "Trace mode: the overlay follows the map using the solved transform.",
  [UI_STATUS_CASE.ALIGN_SOLVED_PREVIEW]: "Align mode: solved transform preview active. Switch to Trace to verify map-following, or adjust placement to refine and recompute.",
  [UI_STATUS_CASE.TRACE_MANUAL]: "Trace mode: the overlay follows the map using the current manual placement.",
  [UI_STATUS_CASE.ALIGN_READY]: describeAlignGestureContract(),
});

export function resolveUiStatusCase(uiState) {
  const panelIntentStatusCase = STATUS_CASE_BY_PANEL_INTENT[uiState.panel.intent];
  if (panelIntentStatusCase) {
    return panelIntentStatusCase;
  }

  if (!uiState.session.image) {
    return UI_STATUS_CASE.EMPTY_SESSION;
  }

  if (uiState.runtime.inputOverride === UI_INPUT_OVERRIDE_KIND.PASS_THROUGH) {
    return UI_STATUS_CASE.PASS_THROUGH;
  }

  if (uiState.runtime.activeGesture) {
    return resolveActiveGestureStatusCase(uiState.runtime.activeGesture);
  }

  const isTrace = isTraceMode(uiState.session.mode);
  const solveState = resolveRegistrationSolveState(uiState.session.registration);
  if (solveState.kind === "dirty") {
    return isTrace
      ? UI_STATUS_CASE.TRACE_REGISTRATION_NEEDS_FIT
      : UI_STATUS_CASE.ALIGN_REGISTRATION_NEEDS_FIT;
  }

  const renderState = resolveOverlayRenderState(uiState.session);
  if (renderState.source === "solved") {
    return isTrace
      ? UI_STATUS_CASE.TRACE_SOLVED
      : UI_STATUS_CASE.ALIGN_SOLVED_PREVIEW;
  }

  if (isTrace) {
    return UI_STATUS_CASE.TRACE_MANUAL;
  }

  return UI_STATUS_CASE.ALIGN_READY;
}

export function resolveUiStatusBaseline({ uiState }) {
  return describeUiStatusCase(resolveUiStatusCase(uiState));
}

export function describeUiStatusCase(statusCase) {
  return STATUS_MESSAGE_BY_CASE[statusCase] ?? "";
}

function describeAlignGestureContract() {
  return "Align mode: drag to move map and overlay together, Shift+drag to move only the overlay, wheel to zoom both, Shift+wheel to scale only the overlay, Ctrl+wheel to rotate the overlay, Alt+wheel to adjust opacity, double-click to add/remove pins, then switch to Trace to fit the overlay.";
}

function resolveActiveGestureStatusCase(activeGesture) {
  if (activeGesture === UI_ACTIVE_GESTURE_KIND.MAP_PAN) {
    return UI_STATUS_CASE.ACTIVE_MAP_PAN;
  }
  if (activeGesture === UI_ACTIVE_GESTURE_KIND.MOVE_OVERLAY) {
    return UI_STATUS_CASE.ACTIVE_OVERLAY_DRAG;
  }
  return UI_STATUS_CASE.ACTIVE_UNKNOWN_DRAG;
}
