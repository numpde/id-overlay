import {
  MACHINE_INPUT_OVERRIDE,
  MACHINE_MODE,
  MACHINE_PANEL_INTENT,
  MACHINE_PLACEMENT_EDIT_KIND,
  MACHINE_STATUS_NOTICE_KIND,
} from "./events.js";
import { getOverlayImageLoadStats } from "../image-normalization.js";
import { RUNTIME_ERROR_SOURCE } from "../runtime-error.js";
import { peekRedoRecord, peekUndoRecord } from "./history.js";
import { selectOverlayPolicy } from "./policy.js";

export const MACHINE_PANEL_STATUS_MESSAGE = Object.freeze({
  PASTE_ARMED: "Press Ctrl/Cmd+V to paste an image from your clipboard.",
  CLEAR_IMAGE_CONFIRM: "Click Clear image? again to remove the current screenshot, placement, and pins.",
  CLEAR_PINS_CONFIRM: "Click Clear pins? again to remove the current registration pins.",
  EMPTY_SESSION: "Paste a screenshot to begin.",
  ALIGN: "Align image to the map.",
  TRACE: "Trace using the aligned image.",
});

export function selectCanUndo(state) {
  return Boolean(selectUndoRecord(state));
}

export function selectCanRedo(state) {
  return Boolean(selectRedoRecord(state));
}

export function selectUndoRecord(state) {
  return peekUndoRecord(state);
}

export function selectRedoRecord(state) {
  return peekRedoRecord(state);
}

export function selectPanelStatusText(state) {
  if (state.panel.intent === MACHINE_PANEL_INTENT.CLEAR_IMAGE_CONFIRM) {
    return MACHINE_PANEL_STATUS_MESSAGE.CLEAR_IMAGE_CONFIRM;
  }
  if (state.panel.intent === MACHINE_PANEL_INTENT.CLEAR_PINS_CONFIRM) {
    return MACHINE_PANEL_STATUS_MESSAGE.CLEAR_PINS_CONFIRM;
  }
  const noticeMessage = formatStatusNotice(state.status.notice, state);
  if (noticeMessage) {
    return noticeMessage;
  }
  return selectBaselinePanelStatusText(state);
}

export function selectBaselinePanelStatusText(state) {
  if (state.panel.intent === MACHINE_PANEL_INTENT.PASTE_ARMED) {
    return MACHINE_PANEL_STATUS_MESSAGE.PASTE_ARMED;
  }
  if (!state.session.image) {
    return MACHINE_PANEL_STATUS_MESSAGE.EMPTY_SESSION;
  }
  if (state.session.mode === MACHINE_MODE.ALIGN) {
    return MACHINE_PANEL_STATUS_MESSAGE.ALIGN;
  }
  return MACHINE_PANEL_STATUS_MESSAGE.TRACE;
}

export function selectOverlayPresentation(state, runtime = null) {
  // TODO(smell): This selector returns presentation flags directly from machine
  // policy. The final render boundary should expose an overlay view model that
  // includes geometry/pin visibility/input ownership facts, leaving DOM code to
  // reconcile nodes only.
  const policy = selectOverlayPolicy(state, runtime);
  return {
    mode: policy.mode,
    isPassThrough: policy.isPassThrough,
    arePinsVisible: policy.arePinsVisible,
    ownsPointerHitTesting: policy.ownsPointerHitTesting,
  };
}

export function selectRuntimePointerScreenPx(stateOrRuntime) {
  const runtime = stateOrRuntime?.runtime ?? stateOrRuntime;
  return runtime?.pointer?.screenPx ?? null;
}

export function selectRuntimeGestureKind(stateOrRuntime) {
  const runtime = stateOrRuntime?.runtime ?? stateOrRuntime;
  return runtime?.activeGesture?.kind ?? null;
}

export function selectIsRuntimeDragging(stateOrRuntime) {
  const runtime = stateOrRuntime?.runtime ?? stateOrRuntime;
  return Boolean(runtime?.activeGesture);
}

export function selectIsInputPassThroughActive(stateOrRuntime) {
  const runtime = stateOrRuntime?.runtime ?? stateOrRuntime;
  return runtime?.inputOverride === MACHINE_INPUT_OVERRIDE.PASS_THROUGH;
}

function formatStatusNotice(notice, state = null) {
  if (!notice) {
    return "";
  }
  const payload = notice.payload ?? {};
  switch (notice.kind) {
    case MACHINE_STATUS_NOTICE_KIND.IMAGE_LOADED:
      return describeLoadedImage(payload.image) ?? "Loaded image.";
    case MACHINE_STATUS_NOTICE_KIND.IMAGE_CLEARED:
      return "Cleared image.";
    case MACHINE_STATUS_NOTICE_KIND.IMAGE_RESTORED:
      return "Restored image.";
    case MACHINE_STATUS_NOTICE_KIND.MODE_SELECTED:
      return payload.mode ? `Switched to ${payload.mode}.` : "";
    case MACHINE_STATUS_NOTICE_KIND.PIN_ADDED:
      return Number.isInteger(payload.pinId) ? `Added pin ${payload.pinId}.` : "Added pin.";
    case MACHINE_STATUS_NOTICE_KIND.PIN_REMOVED:
      return Number.isInteger(payload.pinId) ? `Removed pin ${payload.pinId}.` : "Removed pin.";
    case MACHINE_STATUS_NOTICE_KIND.PINS_CLEARED:
      return `Cleared ${formatPinCount(payload.pinCount)}.`;
    case MACHINE_STATUS_NOTICE_KIND.OVERLAY_FITTED:
      return `Fit overlay from ${formatPinCount(payload.pinCount)}.`;
    case MACHINE_STATUS_NOTICE_KIND.PLACEMENT_CHANGED:
      return describePlacementNotice(payload.editKind);
    case MACHINE_STATUS_NOTICE_KIND.PASTE_CANCELLED:
      return "Paste cancelled.";
    case MACHINE_STATUS_NOTICE_KIND.CLIPBOARD_MISSING_IMAGE:
      return formatClipboardMissingImageNotice(state);
    case MACHINE_STATUS_NOTICE_KIND.CLIPBOARD_IMAGE_UNREADABLE:
      return "Clipboard image could not be read.";
    case MACHINE_STATUS_NOTICE_KIND.RUNTIME_ERROR:
      return describeRuntimeError(payload.error);
    case MACHINE_STATUS_NOTICE_KIND.UNDO:
      return payload.label ? `Undid: ${payload.label}.` : "Undid change.";
    case MACHINE_STATUS_NOTICE_KIND.REDO:
      return payload.label ? `Redid: ${payload.label}.` : "Redid change.";
    case MACHINE_STATUS_NOTICE_KIND.UNDO_EMPTY:
      return "Nothing to undo.";
    case MACHINE_STATUS_NOTICE_KIND.REDO_EMPTY:
      return "Nothing to redo.";
    default:
      return "";
  }
}

function describeLoadedImage(image) {
  const stats = getOverlayImageLoadStats(image);
  if (!stats) {
    return null;
  }
  if (stats.wasResized) {
    return `Loaded screenshot ${stats.workingWidth}×${stats.workingHeight} from ${stats.originalWidth}×${stats.originalHeight}.`;
  }
  return `Loaded screenshot ${stats.workingWidth}×${stats.workingHeight}.`;
}

function describeRuntimeError(runtimeError) {
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

function describePlacementNotice(editKind) {
  if (editKind === MACHINE_PLACEMENT_EDIT_KIND.ROTATE) {
    return "Rotated overlay.";
  }
  if (editKind === MACHINE_PLACEMENT_EDIT_KIND.SCALE) {
    return "Scaled overlay.";
  }
  if (editKind === MACHINE_PLACEMENT_EDIT_KIND.MOVE) {
    return "Moved overlay.";
  }
  return "Adjusted overlay.";
}

function formatClipboardMissingImageNotice(state) {
  const message = "Clipboard does not contain an image.";
  if (state?.panel?.intent !== MACHINE_PANEL_INTENT.PASTE_ARMED) {
    return message;
  }
  return `${message} ${MACHINE_PANEL_STATUS_MESSAGE.PASTE_ARMED}`;
}

function formatPinCount(pinCount) {
  return pinCount === 1 ? "1 pin" : `${Number(pinCount) || 0} pins`;
}
