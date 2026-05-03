import { getOverlayImageLoadStats } from "./image-normalization.js";
import {
  INTERACTION_EVENT,
  PIN_RESULT_REASON,
  SOLVE_RESULT_REASON,
} from "./interaction-policy.js";
import { RUNTIME_ERROR_SOURCE } from "./runtime-error.js";
import { MACHINE_STATUS_MESSAGE } from "./machine/selectors.js";

export const PANEL_FEEDBACK_ACTION = Object.freeze({
  // Final semantic-history shape: panel feedback should be a presentation of
  // semantic transition/event outcomes. Keep this vocabulary only if it stays
  // a thin formatting layer, not a second action taxonomy parallel to UI events.
  PASTE_CANCELLED: "paste-cancelled",
  CLIPBOARD_MISSING_IMAGE: "clipboard-missing-image",
  CLIPBOARD_IMAGE_UNREADABLE: "clipboard-image-unreadable",
  CLIPBOARD_MISSING_IMAGE_WITH_PROMPT: "clipboard-missing-image-with-prompt",
  CLIPBOARD_IMAGE_LOADED: "clipboard-image-loaded",
});

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
  // Final semantic-history shape: interaction events should either become
  // canonical UI outcome events or remain purely low-level telemetry. Avoid a
  // parallel feedback path that bypasses transition-result presentation.
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
    case PANEL_FEEDBACK_ACTION.CLIPBOARD_MISSING_IMAGE:
      return "Clipboard does not contain an image.";
    case PANEL_FEEDBACK_ACTION.CLIPBOARD_IMAGE_UNREADABLE:
      return "Clipboard image could not be read.";
    case PANEL_FEEDBACK_ACTION.CLIPBOARD_MISSING_IMAGE_WITH_PROMPT:
      return `Clipboard does not contain an image. ${MACHINE_STATUS_MESSAGE.PASTE_ARMED}`;
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
