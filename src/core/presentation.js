import { resolveRegistrationSolveState } from "./state.js";
import { resolveOverlayRenderState } from "./transform.js";
import { DRAG_MODE, INTERACTION_EVENT, isTraceMode, nextMode } from "./interactions.js";
import { resolvePanelActionSemantics } from "./panel-state.js";

export const PANEL_TITLE = "Reference Overlay";
export const MANUAL_PASTE_PROMPT = "Press Ctrl/Cmd+V to paste an image from your clipboard.";
export const CLEAR_IMAGE_CONFIRMATION_MESSAGE = "Click Clear? again to remove the current screenshot, placement, and pins.";

export function resolveOverlaySessionPresentation(state) {
  const solvePresentation = resolveRegistrationSolvePresentation(state.registration);
  const renderPresentation = resolveOverlayRenderPresentation(state);

  return {
    hasImage: renderPresentation.hasImage,
    pinCount: solvePresentation.pinCount,
    pinCountLabel: solvePresentation.pinCountLabel,
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
    modeButtonLabel: getModeButtonActionLabel(state.mode),
    hasImage: sessionPresentation.hasImage,
    canComputeTransform: sessionPresentation.canComputeTransform,
    canClearPins: sessionPresentation.canClearPins,
    clearButtonLabel: panelActionPresentation.clearButtonLabel,
    clearButtonVariant: panelActionPresentation.clearButtonVariant,
    clearButtonDisabled: panelActionPresentation.clearButtonDisabled,
    pinCountLabel: sessionPresentation.pinCountLabel,
    solveLabel: sessionPresentation.solve.summaryLabel,
    renderLabel: sessionPresentation.render.label,
    statusMessage: panelActionPresentation.statusMessage ?? statusMessage,
  };
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
    pinCountLabel: String(solveState.pinCount),
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
    case "pointer-outside-image":
    case "no-pointer":
      return "Move the pointer over the screenshot before adding a pin.";
    case "not-align-mode":
      return "Switch to Align before editing pins.";
    case "no-image":
      return "Paste a screenshot before pinning.";
    default:
      return "Pinning is not available right now.";
  }
}

export function describeSolveResultPresentation(result) {
  if (result?.ok) {
    return `Computed transform from ${result.pinCount} pin(s).`;
  }
  if (result?.reason === "insufficient-pins") {
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
    default:
      return null;
  }
}

export function describePanelActionPresentation(action, payload = {}) {
  switch (action) {
    case "paste-cancelled":
      return "Paste cancelled.";
    case "clear-image":
      return "Cleared the current screenshot.";
    case "clipboard-missing-image":
      return "Clipboard does not contain an image.";
    case "clipboard-image-unreadable":
      return "Clipboard image could not be read.";
    case "clipboard-missing-image-with-prompt":
      return `Clipboard does not contain an image. ${MANUAL_PASTE_PROMPT}`;
    case "clipboard-image-loaded":
      return `Loaded screenshot ${payload.width}×${payload.height}.`;
    default:
      return null;
  }
}

export function getModeButtonActionLabel(mode) {
  return nextMode(mode) === "align" ? "Align" : "Trace";
}

export function describeAlignGestureContract() {
  return "Align mode: drag to move map and overlay together, Shift+drag to move only the overlay, wheel to zoom both, Shift+wheel to zoom only the overlay, Alt+wheel to rotate the overlay, double-click to add/remove pins, then compute the transform.";
}

export function describeActiveAlignDrag(dragMode) {
  if (dragMode === DRAG_MODE.SHARED_PAN) {
    return "Shared drag: moving the map and overlay together.";
  }
  if (dragMode === DRAG_MODE.MOVE_OVERLAY) {
    return "Dragging overlay only. Release to keep this placement.";
  }
  return null;
}
