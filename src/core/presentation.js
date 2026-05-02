import { getOverlayImageLoadStats } from "./image-normalization.js";
import { INTERACTION_MODE, isTraceMode } from "./interaction-mode.js";
import { resolveOverlayRenderState } from "./transform.js";
import {
  INTERACTION_EVENT,
  PIN_RESULT_REASON,
  SOLVE_RESULT_REASON,
} from "./interaction-policy.js";
import { RUNTIME_ERROR_SOURCE } from "./runtime-error.js";
import {
  UI_STATUS_CASE,
  describeUiStatusCase,
} from "./ui-status-model.js";

export const PANEL_FEEDBACK_ACTION = Object.freeze({
  PASTE_CANCELLED: "paste-cancelled",
  CLEAR_IMAGE: "clear-image",
  UNDO: "undo",
  REDO: "redo",
  CLIPBOARD_MISSING_IMAGE: "clipboard-missing-image",
  CLIPBOARD_IMAGE_UNREADABLE: "clipboard-image-unreadable",
  CLIPBOARD_MISSING_IMAGE_WITH_PROMPT: "clipboard-missing-image-with-prompt",
  CLIPBOARD_IMAGE_LOADED: "clipboard-image-loaded",
});

const PENDING_HISTORY_CONTROL_LABELS_BY_KIND = Object.freeze({
  "load-image": Object.freeze({
    undo: "Remove image",
    redo: "Reload image",
  }),
  "clear-image": Object.freeze({
    undo: "Reload image",
    redo: "Clear image",
  }),
  "add-pin": Object.freeze({
    undo: "Remove pin",
    redo: "Add pin",
  }),
  "remove-pin": Object.freeze({
    undo: "Restore pin",
    redo: "Remove pin",
  }),
  "clear-pins": Object.freeze({
    undo: "Restore pins",
    redo: "Clear pins",
  }),
  "move-overlay": Object.freeze({
    undo: "Move overlay back",
    redo: "Move overlay again",
  }),
  "rotate-overlay": Object.freeze({
    undo: "Restore rotation",
    redo: "Rotate overlay again",
  }),
  "scale-overlay": Object.freeze({
    undo: "Restore scale",
    redo: "Scale overlay again",
  }),
});

const HISTORY_CONTROL_FALLBACK_LABELS = Object.freeze({
  undo: "Undo",
  redo: "Redo",
});

export function describeRegistrationSolveSummary(solveState) {
  if (solveState.kind === "solved") {
    return `Solved from ${solveState.solvedPinCount} pin(s)`;
  }
  if (solveState.kind === "dirty") {
    return "Pins changed; fit pending";
  }
  if (solveState.kind === "ready") {
    return "Ready to fit";
  }
  if (solveState.kind === "insufficient-pins") {
    return "Collect at least 2 pins";
  }
  return "No pins yet";
}

export function describeOverlayRenderLabel({ renderState, mode }) {
  if (renderState.source === "none") {
    return "No image";
  }
  if (renderState.source === "solved") {
    return isTraceMode(mode)
      ? "Solved transform active"
      : "Solved transform preview active";
  }
  return "Manual placement active";
}

export function describeOverlayRenderMessage({ renderState, mode }) {
  const statusCase = resolveOverlayRenderStatusCase({ renderState, mode });
  return statusCase ? describeUiStatusCase(statusCase) : null;
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
    case PANEL_FEEDBACK_ACTION.UNDO:
      return payload.historyDescriptor?.label
        ? `Undid: ${payload.historyDescriptor.label}.`
        : "Undid change.";
    case PANEL_FEEDBACK_ACTION.REDO:
      return payload.historyDescriptor?.label
        ? `Redid: ${payload.historyDescriptor.label}.`
        : "Redid change.";
    case PANEL_FEEDBACK_ACTION.CLIPBOARD_MISSING_IMAGE:
      return "Clipboard does not contain an image.";
    case PANEL_FEEDBACK_ACTION.CLIPBOARD_IMAGE_UNREADABLE:
      return "Clipboard image could not be read.";
    case PANEL_FEEDBACK_ACTION.CLIPBOARD_MISSING_IMAGE_WITH_PROMPT:
      return `Clipboard does not contain an image. ${describeUiStatusCase(UI_STATUS_CASE.PANEL_PASTE_ARMED)}`;
    case PANEL_FEEDBACK_ACTION.CLIPBOARD_IMAGE_LOADED:
      return describeLoadedImagePresentation(payload);
    default:
      return null;
  }
}

function resolveOverlayRenderStatusCase({ renderState, mode }) {
  if (renderState.source === "none") {
    return UI_STATUS_CASE.EMPTY_SESSION;
  }
  if (renderState.source === "solved") {
    return isTraceMode(mode)
      ? UI_STATUS_CASE.TRACE_SOLVED
      : UI_STATUS_CASE.ALIGN_SOLVED_PREVIEW;
  }
  return isTraceMode(mode)
    ? UI_STATUS_CASE.TRACE_MANUAL
    : null;
}

export function describePendingHistoryControl({ direction, descriptor } = {}) {
  if (!descriptor?.kind) {
    return "";
  }
  return PENDING_HISTORY_CONTROL_LABELS_BY_KIND[descriptor.kind]?.[direction] ?? "";
}

export function resolveHistoryControlPresentation({ direction, descriptor } = {}) {
  const title = describePendingHistoryControl({ direction, descriptor });
  return {
    title,
    accessibleLabel: title || HISTORY_CONTROL_FALLBACK_LABELS[direction] || "",
  };
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
