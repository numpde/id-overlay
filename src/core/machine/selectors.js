import {
  MACHINE_INPUT_OVERRIDE,
  MACHINE_MODE,
  MACHINE_PANEL_INTENT,
  MACHINE_PLACEMENT_EDIT_KIND,
  MACHINE_STATUS_NOTICE_KIND,
} from "./events.js";
import { peekRedoRecord, peekUndoRecord } from "./history.js";
import { selectPanelPolicy } from "./policy.js";
import { isValidPanelRequestId } from "./state.js";
import { getOverlayImageLoadStats } from "../image-normalization.js";
import { RUNTIME_ERROR_SOURCE } from "../runtime-error.js";

export const MACHINE_PANEL_MAIN_ACTION = Object.freeze({
  PASTE: "paste",
  PASTE_ARMED: "paste-armed",
  CLEAR_PINS: "clear-pins",
  CONFIRM_CLEAR_PINS: "confirm-clear-pins",
  CLEAR_IMAGE: "clear-image",
  CONFIRM_CLEAR_IMAGE: "confirm-clear-image",
});

export const MACHINE_STATUS_MESSAGE = Object.freeze({
  PASTE_ARMED: "Press Ctrl/Cmd+V to paste an image from your clipboard.",
  CLEAR_IMAGE_CONFIRM: "Click Clear image? again to remove the current screenshot, placement, and pins.",
  CLEAR_PINS_CONFIRM: "Click Clear pins? again to remove the current registration pins.",
  EMPTY_SESSION: "Paste a screenshot to begin.",
  ALIGN: "Align image to the map.",
  TRACE: "Trace using the aligned image.",
});

export function selectCanUndo(state) {
  return Boolean(peekUndoRecord(state));
}

export function selectCanRedo(state) {
  return Boolean(peekRedoRecord(state));
}

export function selectIsCurrentPanelRequest(state, requestId) {
  return isValidPanelRequestId(requestId) && state.panel.requestId === requestId;
}

export function selectUndoTooltip(state) {
  return peekUndoRecord(state)?.undoLabel ?? "";
}

export function selectRedoTooltip(state) {
  return peekRedoRecord(state)?.redoLabel ?? "";
}

export function selectPanelView(state) {
  const policy = selectPanelPolicy(state);
  const canUndo = selectCanUndo(state);
  const canRedo = selectCanRedo(state);
  const undoTooltip = selectUndoTooltip(state);
  const redoTooltip = selectRedoTooltip(state);
  return {
    mode: state.session.mode,
    isAlignEnabled: policy.canSelectAlign,
    isTraceEnabled: policy.canSelectTrace,
    opacityControl: {
      value: String(state.session.opacity),
      disabled: !policy.canSetOpacity,
    },
    modeSwitch: {
      checked: policy.isTrace,
      disabled: !policy.canSelectAlign,
      accessibleLabel: `Mode: ${policy.isTrace ? "Trace" : "Align"}`,
      mode: state.session.mode,
    },
    mainAction: resolveMainAction(state),
    canClearPins: policy.canClearPins,
    canUndo,
    canRedo,
    undoTooltip,
    redoTooltip,
    status: selectStatus(state),
    historyControls: {
      undo: createHistoryControl({
        fallbackLabel: "Undo",
        tooltip: undoTooltip,
        disabled: !canUndo,
      }),
      redo: createHistoryControl({
        fallbackLabel: "Redo",
        tooltip: redoTooltip,
        disabled: !canRedo,
      }),
    },
  };
}

export function selectStatus(state) {
  if (state.panel.intent === MACHINE_PANEL_INTENT.CLEAR_IMAGE_CONFIRM) {
    return MACHINE_STATUS_MESSAGE.CLEAR_IMAGE_CONFIRM;
  }
  if (state.panel.intent === MACHINE_PANEL_INTENT.CLEAR_PINS_CONFIRM) {
    return MACHINE_STATUS_MESSAGE.CLEAR_PINS_CONFIRM;
  }
  const noticeMessage = formatStatusNotice(state.status.notice, state);
  if (noticeMessage) {
    return noticeMessage;
  }
  return selectBaselineStatus(state);
}

export function selectBaselineStatus(state) {
  if (state.panel.intent === MACHINE_PANEL_INTENT.PASTE_ARMED) {
    return MACHINE_STATUS_MESSAGE.PASTE_ARMED;
  }
  if (!state.session.image) {
    return MACHINE_STATUS_MESSAGE.EMPTY_SESSION;
  }
  if (state.session.mode === MACHINE_MODE.ALIGN) {
    return MACHINE_STATUS_MESSAGE.ALIGN;
  }
  return MACHINE_STATUS_MESSAGE.TRACE;
}

export function selectOverlayPolicy(state, runtime = null) {
  const session = state.session ?? state;
  const hasImage = Boolean(session.image);
  const mode = session.mode;
  const runtimeState = runtime ?? state.runtime ?? null;
  const hasInputPassThrough = runtimeState?.inputOverride === MACHINE_INPUT_OVERRIDE.PASS_THROUGH;
  const isNativeMapInput = !hasImage || mode === MACHINE_MODE.TRACE;
  const canEditOverlay = hasImage && mode === MACHINE_MODE.ALIGN;
  return {
    hasImage,
    mode,
    isNativeMapInput,
    isPassThrough: isNativeMapInput || hasInputPassThrough,
    canEditOverlay,
    arePinsVisible: canEditOverlay,
    ownsPointerHitTesting: canEditOverlay && !hasInputPassThrough,
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

export function formatStatusNotice(notice, state = null) {
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

function resolveMainAction(state) {
  const policy = selectPanelPolicy(state);
  if (policy.canPaste) {
    return createMainAction({
      kind: state.panel.intent === MACHINE_PANEL_INTENT.PASTE_ARMED
        ? MACHINE_PANEL_MAIN_ACTION.PASTE_ARMED
        : MACHINE_PANEL_MAIN_ACTION.PASTE,
      label: state.panel.intent === MACHINE_PANEL_INTENT.PASTE_ARMED ? "Paste…" : "Paste",
      intent: state.panel.intent,
      target: MACHINE_PANEL_MAIN_ACTION.PASTE,
    });
  }
  if (policy.canClearPins) {
    if (state.panel.intent === MACHINE_PANEL_INTENT.CLEAR_PINS_CONFIRM) {
      return createMainAction({
        kind: MACHINE_PANEL_MAIN_ACTION.CONFIRM_CLEAR_PINS,
        label: "Clear pins?",
        intent: state.panel.intent,
        target: MACHINE_PANEL_MAIN_ACTION.CLEAR_PINS,
        presentationKind: "confirm",
      });
    }
    return createMainAction({
      kind: MACHINE_PANEL_MAIN_ACTION.CLEAR_PINS,
      label: resolveClearPinsLabel(policy.pinCount),
      intent: state.panel.intent,
      target: MACHINE_PANEL_MAIN_ACTION.CLEAR_PINS,
    });
  }
  if (state.panel.intent === MACHINE_PANEL_INTENT.CLEAR_IMAGE_CONFIRM) {
    return createMainAction({
      kind: MACHINE_PANEL_MAIN_ACTION.CONFIRM_CLEAR_IMAGE,
      label: "Clear image?",
      intent: state.panel.intent,
      target: MACHINE_PANEL_MAIN_ACTION.CLEAR_IMAGE,
      presentationKind: "confirm",
    });
  }
  return createMainAction({
    kind: MACHINE_PANEL_MAIN_ACTION.CLEAR_IMAGE,
    label: "Clear image",
    intent: state.panel.intent,
    target: MACHINE_PANEL_MAIN_ACTION.CLEAR_IMAGE,
  });
}

function createMainAction({
  kind,
  label,
  intent,
  target,
  presentationKind = "neutral",
}) {
  return {
    kind,
    label,
    intent,
    target,
    disabled: false,
    presentationKind,
  };
}

function createHistoryControl({ fallbackLabel, tooltip, disabled }) {
  return {
    disabled,
    title: tooltip,
    accessibleLabel: tooltip || fallbackLabel,
  };
}

function resolveClearPinsLabel(pinCount) {
  if (pinCount === 1) {
    return "Clear 1 pin";
  }
  if (pinCount > 1) {
    return `Clear ${pinCount} pins`;
  }
  return "Clear pins";
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
  return `${message} ${MACHINE_STATUS_MESSAGE.PASTE_ARMED}`;
}

function formatPinCount(pinCount) {
  return pinCount === 1 ? "1 pin" : `${Number(pinCount) || 0} pins`;
}
