import { resolveRegistrationSolvePresentation } from "./state.js";
import { resolveOverlayRenderState } from "./transform.js";
import { DRAG_MODE, INTERACTION_EVENT, INTERACTION_MODE } from "./interactions.js";

export function resolveOverlaySessionPresentation(state) {
  const solvePresentation = resolveRegistrationSolvePresentation(state.registration);
  const renderPresentation = resolveOverlayRenderState(state);
  const pinCount = solvePresentation.pinCount;
  const hasImage = renderPresentation.source !== "none";

  return {
    hasImage,
    pinCount,
    pinCountLabel: String(pinCount),
    canComputeTransform: solvePresentation.canCompute,
    canClearPins: pinCount > 0,
    solve: solvePresentation,
    render: renderPresentation,
  };
}

export function resolvePanelPresentation({
  state,
  statusMessage,
  isPasteArmed,
  manualPastePrompt,
}) {
  const sessionPresentation = resolveOverlaySessionPresentation(state);

  return {
    pasteLabel: isPasteArmed ? "Paste…" : "Paste",
    opacityValue: String(state.opacity),
    modeButtonLabel: getModeButtonActionLabel(state.mode),
    hasImage: sessionPresentation.hasImage,
    canComputeTransform: sessionPresentation.canComputeTransform,
    canClearPins: sessionPresentation.canClearPins,
    pinCountLabel: sessionPresentation.pinCountLabel,
    solveLabel: sessionPresentation.solve.summaryLabel,
    renderLabel: sessionPresentation.render.label,
    statusMessage: isPasteArmed ? manualPastePrompt : statusMessage,
  };
}

export function resolveDefaultStatusMessage({ state, runtime }) {
  const sessionPresentation = resolveOverlaySessionPresentation(state);
  if (sessionPresentation.render.source === "none") {
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

export function getModeButtonActionLabel(mode) {
  return mode === INTERACTION_MODE.ALIGN ? "Trace" : "Align";
}

export function describeAlignGestureContract() {
  return "Align mode: drag to move map and overlay together, Shift+drag to move only the overlay, wheel to zoom both, Shift+wheel to zoom only the overlay, Alt+wheel to rotate the overlay, double-click or press P to add/remove pins, then compute the transform.";
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
