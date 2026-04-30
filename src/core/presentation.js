import { getOverlayImageLoadStats } from "./image-normalization.js";
import { INTERACTION_MODE, isTraceMode } from "./interaction-mode.js";
import { resolveRegistrationSolveState } from "./state.js";
import { resolveOverlayRenderState } from "./transform.js";
import {
  DRAG_MODE,
  INTERACTION_EVENT,
  PIN_RESULT_REASON,
  SOLVE_RESULT_REASON,
} from "./interaction-policy.js";
import { resolvePanelActionSemantics } from "./panel-state.js";
import { RUNTIME_ERROR_SOURCE } from "./runtime-error.js";

export const PANEL_TITLE = "Reference Overlay";
export const PANEL_REPO_URL = "https://github.com/numpde/id-overlay";
export const MANUAL_PASTE_PROMPT = "Press Ctrl/Cmd+V to paste an image from your clipboard.";
export const CLEAR_IMAGE_CONFIRMATION_MESSAGE = "Click Clear? again to remove the current screenshot, placement, and pins.";
export const PANEL_FEEDBACK_ACTION = Object.freeze({
  PASTE_CANCELLED: "paste-cancelled",
  CLEAR_IMAGE: "clear-image",
  CLIPBOARD_MISSING_IMAGE: "clipboard-missing-image",
  CLIPBOARD_IMAGE_UNREADABLE: "clipboard-image-unreadable",
  CLIPBOARD_MISSING_IMAGE_WITH_PROMPT: "clipboard-missing-image-with-prompt",
  CLIPBOARD_IMAGE_LOADED: "clipboard-image-loaded",
});

export function resolveOverlaySessionPresentation(state) {
  const solvePresentation = resolveRegistrationSolvePresentation(state.registration);
  const renderPresentation = resolveOverlayRenderPresentation(state);

  return {
    hasImage: renderPresentation.hasImage,
    pinCount: solvePresentation.pinCount,
    canComputeTransform: solvePresentation.canCompute,
    canClearPins: solvePresentation.canClearPins,
    solve: solvePresentation,
    render: renderPresentation,
  };
}

export function resolvePanelPresentation({
  state,
  statusMessage,
  panelActionState,
}) {
  const sessionPresentation = resolveOverlaySessionPresentation(state);
  const panelActionPresentation = resolvePanelActionPresentation({
    actionState: panelActionState,
    hasImage: sessionPresentation.hasImage,
  });

  return {
    pasteLabel: panelActionPresentation.pasteLabel,
    opacityValue: String(state.opacity),
    modeSwitch: resolveModeSwitchPresentation(state.mode),
    hasImage: sessionPresentation.hasImage,
    canComputeTransform: sessionPresentation.canComputeTransform,
    canClearPins: sessionPresentation.canClearPins,
    clearPinsLabel: resolveClearPinsLabel(sessionPresentation.pinCount),
    clearButtonLabel: panelActionPresentation.clearButtonLabel,
    clearButtonVariant: panelActionPresentation.clearButtonVariant,
    clearButtonDisabled: panelActionPresentation.clearButtonDisabled,
    statusMessage: panelActionPresentation.statusMessage ?? statusMessage,
  };
}

export function resolveClearPinsLabel(pinCount) {
  if (pinCount === 1) {
    return "Clear 1 pin";
  }
  if (pinCount > 1) {
    return `Clear ${pinCount} pins`;
  }
  return "Clear pins";
}

export function resolveClearImagePresentation({ hasImage, isConfirming }) {
  return {
    label: isConfirming ? "Clear?" : "Clear",
    variant: isConfirming ? "confirm" : "neutral",
    disabled: !hasImage,
    statusMessage: isConfirming ? CLEAR_IMAGE_CONFIRMATION_MESSAGE : null,
  };
}

export function resolvePanelActionPresentation({ actionState, hasImage }) {
  const semantics = resolvePanelActionSemantics(actionState);
  const clearImagePresentation = resolveClearImagePresentation({
    hasImage,
    isConfirming: semantics.clearConfirming,
  });
  return {
    pasteLabel: semantics.pasteArmed ? "Paste…" : "Paste",
    clearButtonLabel: clearImagePresentation.label,
    clearButtonVariant: clearImagePresentation.variant,
    clearButtonDisabled: clearImagePresentation.disabled,
    statusMessage: semantics.pasteArmed
      ? MANUAL_PASTE_PROMPT
      : clearImagePresentation.statusMessage,
  };
}

export function resolveRegistrationSolvePresentation(registration) {
  const solveState = resolveRegistrationSolveState(registration);
  const common = {
    ...solveState,
    canClearPins: solveState.pinCount > 0,
  };
  if (solveState.kind === "solved") {
    return {
      ...common,
      summaryLabel: `Solved from ${solveState.solvedPinCount} pin(s)`,
      statusMessage: null,
    };
  }
  if (solveState.kind === "dirty") {
    return {
      ...common,
      summaryLabel: "Pins changed; recompute needed",
      statusMessage: "Align mode: pins changed. Compute the transform or switch to Trace to auto-apply it.",
    };
  }
  if (solveState.kind === "ready") {
    return {
      ...common,
      summaryLabel: "Ready to compute",
      statusMessage: null,
    };
  }
  if (solveState.kind === "insufficient-pins") {
    return {
      ...common,
      summaryLabel: "Collect at least 2 pins",
      statusMessage: null,
    };
  }
  return {
    ...common,
    summaryLabel: "No pins yet",
    statusMessage: null,
  };
}

export function resolveOverlayRenderPresentation(state) {
  const renderState = resolveOverlayRenderState(state);
  if (renderState.source === "none") {
    return {
      hasImage: false,
      source: renderState.source,
      label: "No image",
      message: "Paste a screenshot to begin.",
    };
  }
  if (renderState.source === "solved") {
    return isTraceMode(state.mode)
      ? {
          hasImage: true,
          source: renderState.source,
          label: "Solved transform active",
          message: "Trace mode: the overlay follows the map using the solved transform.",
        }
      : {
          hasImage: true,
          source: renderState.source,
          label: "Solved transform preview active",
          message: "Align mode: solved transform preview active. Switch to Trace to verify map-following, or adjust placement to refine and recompute.",
        };
  }
  return isTraceMode(state.mode)
    ? {
        hasImage: true,
        source: renderState.source,
        label: "Manual placement active",
        message: "Trace mode: the overlay follows the map using the current manual placement.",
      }
    : {
        hasImage: true,
        source: renderState.source,
        label: "Manual placement active",
        message: null,
      };
}

export function resolveDefaultStatusMessage({ state, runtime }) {
  const sessionPresentation = resolveOverlaySessionPresentation(state);
  if (!sessionPresentation.hasImage) {
    return sessionPresentation.render.message;
  }

  if (runtime.isPassThroughActive) {
    return "Pass-through active: pan or zoom iD underneath, then release Space to continue registering.";
  }

  if (runtime.isDragging) {
    return describeActiveAlignDrag(runtime.dragMode) ?? "Dragging overlay.";
  }

  if (sessionPresentation.solve.statusMessage) {
    return sessionPresentation.solve.statusMessage;
  }

  return sessionPresentation.render.message ?? describeAlignGestureContract();
}

export function describePinResultPresentation(result) {
  if (result?.ok && result.action === "added") {
    return `Added pin ${result.pin.id}.`;
  }
  if (result?.ok && result.action === "removed") {
    return `Removed pin ${result.pin.id}.`;
  }

  switch (result?.reason) {
    case PIN_RESULT_REASON.POINTER_OUTSIDE_IMAGE:
    case PIN_RESULT_REASON.NO_POINTER:
      return "Move the pointer over the screenshot before adding a pin.";
    case PIN_RESULT_REASON.NOT_ALIGN_MODE:
      return "Switch to Align before editing pins.";
    case PIN_RESULT_REASON.NO_IMAGE:
      return "Paste a screenshot before pinning.";
    default:
      return "Pinning is not available right now.";
  }
}

export function describeSolveResultPresentation(result) {
  if (result?.ok) {
    return `Computed transform from ${result.pinCount} pin(s).`;
  }
  if (result?.reason === SOLVE_RESULT_REASON.INSUFFICIENT_PINS) {
    return `Need at least 2 pins to compute a transform. Current pins: ${result.pinCount ?? 0}.`;
  }
  return "Could not compute a transform from the current pins.";
}

export function describeInteractionEventPresentation(event) {
  switch (event?.type) {
    case INTERACTION_EVENT.PIN_RESULT:
      return describePinResultPresentation(event.result);
    case INTERACTION_EVENT.SOLVE_RESULT:
      return describeSolveResultPresentation(event.result);
    case INTERACTION_EVENT.PINS_CLEARED:
      return "Cleared all registration pins.";
    case INTERACTION_EVENT.RUNTIME_ERROR:
      return describeRuntimeErrorPresentation(event.error);
    default:
      return null;
  }
}

export function describeRuntimeErrorPresentation(runtimeError) {
  if (!runtimeError) {
    return "The overlay hit an unexpected error.";
  }

  if (runtimeError.source === RUNTIME_ERROR_SOURCE.OVERLAY) {
    return "The overlay gesture failed. Try the action again.";
  }
  if (runtimeError.source === RUNTIME_ERROR_SOURCE.PAGE_ADAPTER) {
    return "The map bridge failed temporarily. Try the action again.";
  }
  if (runtimeError.source === RUNTIME_ERROR_SOURCE.INTERACTIONS) {
    return "The overlay interaction failed. Try the action again.";
  }
  return runtimeError.message;
}

export function describePanelActionPresentation(action, payload = {}) {
  switch (action) {
    case PANEL_FEEDBACK_ACTION.PASTE_CANCELLED:
      return "Paste cancelled.";
    case PANEL_FEEDBACK_ACTION.CLEAR_IMAGE:
      return "Cleared the current screenshot.";
    case PANEL_FEEDBACK_ACTION.CLIPBOARD_MISSING_IMAGE:
      return "Clipboard does not contain an image.";
    case PANEL_FEEDBACK_ACTION.CLIPBOARD_IMAGE_UNREADABLE:
      return "Clipboard image could not be read.";
    case PANEL_FEEDBACK_ACTION.CLIPBOARD_MISSING_IMAGE_WITH_PROMPT:
      return `Clipboard does not contain an image. ${MANUAL_PASTE_PROMPT}`;
    case PANEL_FEEDBACK_ACTION.CLIPBOARD_IMAGE_LOADED:
      return describeLoadedImagePresentation(payload);
    default:
      return null;
  }
}

export function describeLoadedImagePresentation(image) {
  const stats = getOverlayImageLoadStats(image);
  if (!stats) {
    return null;
  }
  if (stats.wasResized) {
    return `Loaded screenshot ${stats.workingWidth}×${stats.workingHeight} from ${stats.originalWidth}×${stats.originalHeight}.`;
  }
  return `Loaded screenshot ${stats.workingWidth}×${stats.workingHeight}.`;
}

export function resolveModeSwitchPresentation(mode) {
  return {
    checked: mode === INTERACTION_MODE.ALIGN,
    label: mode === INTERACTION_MODE.ALIGN ? "Align" : "Trace",
    ariaLabel: `Mode: ${mode === INTERACTION_MODE.ALIGN ? "Align" : "Trace"}`,
  };
}

export function describeAlignGestureContract() {
  return "Align mode: drag to move map and overlay together, Shift+drag to move only the overlay, wheel to zoom both, Shift+wheel to scale only the overlay, Ctrl+wheel to rotate the overlay, Alt+wheel to adjust opacity, double-click to add/remove pins, then compute the transform.";
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
