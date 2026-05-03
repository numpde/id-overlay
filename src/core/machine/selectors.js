import {
  MACHINE_FEEDBACK_KIND,
  MACHINE_MODE,
  MACHINE_PANEL_INTENT,
} from "./events.js";
import { peekRedoRecord, peekUndoRecord } from "./history.js";
import { selectPanelPolicy } from "./policy.js";
import { isValidPanelRequestId } from "./state.js";

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
  if (state.status.messageOverride?.message) {
    return state.status.messageOverride.message;
  }
  if (state.panel.intent === MACHINE_PANEL_INTENT.PASTE_ARMED) {
    return MACHINE_STATUS_MESSAGE.PASTE_ARMED;
  }
  if (state.panel.intent === MACHINE_PANEL_INTENT.CLEAR_IMAGE_CONFIRM) {
    return MACHINE_STATUS_MESSAGE.CLEAR_IMAGE_CONFIRM;
  }
  if (state.panel.intent === MACHINE_PANEL_INTENT.CLEAR_PINS_CONFIRM) {
    return MACHINE_STATUS_MESSAGE.CLEAR_PINS_CONFIRM;
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
  const hasInputPassThrough = runtimeState?.inputOverride === "pass-through" ||
    runtimeState?.isPassThroughActive === true;
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

export function formatFeedback(feedback) {
  if (!feedback || feedback.kind === MACHINE_FEEDBACK_KIND.NONE) {
    return "";
  }
  if (feedback.kind === MACHINE_FEEDBACK_KIND.UNDO) {
    return feedback.message ? `Undid: ${feedback.message}.` : "Undid change.";
  }
  if (feedback.kind === MACHINE_FEEDBACK_KIND.REDO) {
    return feedback.message ? `Redid: ${feedback.message}.` : "Redid change.";
  }
  return feedback.message ?? "";
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
