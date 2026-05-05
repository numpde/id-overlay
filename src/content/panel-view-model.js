import { getOverlayImageLoadStats } from "../core/image-normalization.js";
import {
  MACHINE_EVENT_KIND,
  MACHINE_MODE,
  MACHINE_PANEL_INTENT,
  MACHINE_PLACEMENT_EDIT_KIND,
  MACHINE_STATUS_NOTICE_KIND,
  createCancelPanelIntentEvent,
} from "../core/machine/events.js";
import {
  selectCanRedo,
  selectCanUndo,
  selectRedoRecord,
  selectUndoRecord,
} from "../core/machine/selectors.js";
import { selectPanelPolicy } from "../core/machine/policy.js";
import { RUNTIME_ERROR_SOURCE } from "../core/runtime-error.js";

export const PANEL_MAIN_ACTION = Object.freeze({
  PASTE: "paste",
  PASTE_ARMED: "paste-armed",
  CLEAR_PINS: "clear-pins",
  CONFIRM_CLEAR_PINS: "confirm-clear-pins",
  CLEAR_IMAGE: "clear-image",
  CONFIRM_CLEAR_IMAGE: "confirm-clear-image",
});

export const PANEL_STATUS_MESSAGE = Object.freeze({
  PASTE_ARMED: "Press Ctrl/Cmd+V to paste an image from your clipboard.",
  CLEAR_IMAGE_CONFIRM: "Click Clear image? again to remove the current screenshot, placement, and pins.",
  CLEAR_PINS_CONFIRM: "Click Clear pins? again to remove the current registration pins.",
  EMPTY_SESSION: "Paste a screenshot to begin.",
  ALIGN: "Align image to the map.",
  TRACE: "Trace using the aligned image.",
});

export function selectPanelView(state) {
  // TODO(smell): The panel view model still returns executable machine events
  // for controls. The final shape should expose pure render data derived from
  // canonical machine selectors; activation meaning belongs inside the machine.
  const policy = selectPanelPolicy(state);
  return {
    mode: state.session.mode,
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
    status: selectStatus(state),
    historyControls: {
      undo: createHistoryControl({
        fallbackLabel: "Undo",
        tooltip: selectUndoRecord(state)?.undoLabel ?? "",
        disabled: !selectCanUndo(state),
      }),
      redo: createHistoryControl({
        fallbackLabel: "Redo",
        tooltip: selectRedoRecord(state)?.redoLabel ?? "",
        disabled: !selectCanRedo(state),
      }),
    },
  };
}

export function selectStatus(state) {
  if (state.panel.intent === MACHINE_PANEL_INTENT.CLEAR_IMAGE_CONFIRM) {
    return PANEL_STATUS_MESSAGE.CLEAR_IMAGE_CONFIRM;
  }
  if (state.panel.intent === MACHINE_PANEL_INTENT.CLEAR_PINS_CONFIRM) {
    return PANEL_STATUS_MESSAGE.CLEAR_PINS_CONFIRM;
  }
  const noticeMessage = formatStatusNotice(state.status.notice, state);
  if (noticeMessage) {
    return noticeMessage;
  }
  return selectBaselineStatus(state);
}

export function selectBaselineStatus(state) {
  if (state.panel.intent === MACHINE_PANEL_INTENT.PASTE_ARMED) {
    return PANEL_STATUS_MESSAGE.PASTE_ARMED;
  }
  if (!state.session.image) {
    return PANEL_STATUS_MESSAGE.EMPTY_SESSION;
  }
  if (state.session.mode === MACHINE_MODE.ALIGN) {
    return PANEL_STATUS_MESSAGE.ALIGN;
  }
  return PANEL_STATUS_MESSAGE.TRACE;
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
  // TODO(smell): Primary-button meaning is currently decided while formatting
  // the view. Move this to a core selector used by both panel rendering and the
  // machine's user-intent transition for primary activation.
  const policy = selectPanelPolicy(state);
  if (policy.canPaste) {
    return createMainAction({
      kind: state.panel.intent === MACHINE_PANEL_INTENT.PASTE_ARMED
        ? PANEL_MAIN_ACTION.PASTE_ARMED
        : PANEL_MAIN_ACTION.PASTE,
      label: state.panel.intent === MACHINE_PANEL_INTENT.PASTE_ARMED ? "Paste…" : "Paste",
      intent: state.panel.intent,
      event: state.panel.intent === MACHINE_PANEL_INTENT.PASTE_ARMED
        ? createCancelPanelIntentEvent({
          requestId: state.panel.requestId,
          noticeKind: MACHINE_STATUS_NOTICE_KIND.PASTE_CANCELLED,
        })
        : {
          type: MACHINE_EVENT_KIND.REQUEST_PANEL_INTENT,
          intent: MACHINE_PANEL_INTENT.PASTE_ARMED,
        },
    });
  }
  if (policy.canClearPins) {
    if (state.panel.intent === MACHINE_PANEL_INTENT.CLEAR_PINS_CONFIRM) {
      return createMainAction({
        kind: PANEL_MAIN_ACTION.CONFIRM_CLEAR_PINS,
        label: "Clear pins?",
        intent: state.panel.intent,
        event: { type: MACHINE_EVENT_KIND.CLEAR_PINS },
        presentationKind: "confirm",
      });
    }
    return createMainAction({
      kind: PANEL_MAIN_ACTION.CLEAR_PINS,
      label: resolveClearPinsLabel(policy.pinCount),
      intent: state.panel.intent,
      event: {
        type: MACHINE_EVENT_KIND.REQUEST_PANEL_INTENT,
        intent: MACHINE_PANEL_INTENT.CLEAR_PINS_CONFIRM,
      },
    });
  }
  if (state.panel.intent === MACHINE_PANEL_INTENT.CLEAR_IMAGE_CONFIRM) {
    return createMainAction({
      kind: PANEL_MAIN_ACTION.CONFIRM_CLEAR_IMAGE,
      label: "Clear image?",
      intent: state.panel.intent,
      event: { type: MACHINE_EVENT_KIND.CLEAR_IMAGE },
      presentationKind: "confirm",
    });
  }
  return createMainAction({
    kind: PANEL_MAIN_ACTION.CLEAR_IMAGE,
    label: "Clear image",
    intent: state.panel.intent,
    event: {
      type: MACHINE_EVENT_KIND.REQUEST_PANEL_INTENT,
      intent: MACHINE_PANEL_INTENT.CLEAR_IMAGE_CONFIRM,
    },
  });
}

function createMainAction({
  kind,
  label,
  intent,
  event,
  presentationKind = "neutral",
}) {
  return {
    kind,
    label,
    intent,
    event,
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
  return `${message} ${PANEL_STATUS_MESSAGE.PASTE_ARMED}`;
}

function formatPinCount(pinCount) {
  return pinCount === 1 ? "1 pin" : `${Number(pinCount) || 0} pins`;
}
