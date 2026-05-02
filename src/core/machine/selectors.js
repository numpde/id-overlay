import {
  MACHINE_FEEDBACK_KIND,
  MACHINE_MODE,
  MACHINE_PANEL_INTENT,
} from "./events.js";
import { peekRedoRecord, peekUndoRecord } from "./history.js";
import { isValidPanelRequestId } from "./state.js";

export const MACHINE_PANEL_MAIN_ACTION = Object.freeze({
  PASTE: "paste",
  PASTE_ARMED: "paste-armed",
  CLEAR_PINS: "clear-pins",
  CONFIRM_CLEAR_PINS: "confirm-clear-pins",
  CLEAR_IMAGE: "clear-image",
  CONFIRM_CLEAR_IMAGE: "confirm-clear-image",
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
  const hasImage = Boolean(state.session.image);
  const isTrace = state.session.mode === MACHINE_MODE.TRACE;
  const hasPins = state.session.registration.pins.length > 0;
  const canClearPins = hasImage && hasPins && !isTrace;
  const canUndo = selectCanUndo(state);
  const canRedo = selectCanRedo(state);
  const undoTooltip = selectUndoTooltip(state);
  const redoTooltip = selectRedoTooltip(state);
  return {
    mode: state.session.mode,
    isAlignEnabled: hasImage,
    isTraceEnabled: true,
    opacityControl: {
      value: String(state.session.opacity),
      disabled: !hasImage,
    },
    modeSwitch: {
      checked: isTrace,
      disabled: !hasImage,
      accessibleLabel: `Mode: ${isTrace ? "Trace" : "Align"}`,
      mode: state.session.mode,
    },
    mainAction: resolveMainAction(state),
    canClearPins,
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

export function selectStatus(state, feedback = null) {
  if (feedback?.message) {
    return feedback.message;
  }
  if (state.status.messageOverride?.message) {
    return state.status.messageOverride.message;
  }
  if (state.panel.intent === MACHINE_PANEL_INTENT.PASTE_ARMED) {
    return "Press Ctrl/Cmd+V to paste an image from your clipboard.";
  }
  if (state.panel.intent === MACHINE_PANEL_INTENT.CLEAR_IMAGE_CONFIRM) {
    return "Click Clear image? again to remove the current screenshot, placement, and pins.";
  }
  if (state.panel.intent === MACHINE_PANEL_INTENT.CLEAR_PINS_CONFIRM) {
    return "Click Clear pins? again to remove the current registration pins.";
  }
  if (!state.session.image) {
    return "Paste a screenshot to begin.";
  }
  if (state.session.mode === MACHINE_MODE.ALIGN) {
    return "Align image to the map.";
  }
  return "Trace using the aligned image.";
}

export function selectOverlayPolicy(state) {
  const hasImage = Boolean(state.session.image);
  return {
    hasImage,
    mode: state.session.mode,
    isPassThrough: !hasImage || state.session.mode === MACHINE_MODE.TRACE,
    canEditOverlay: hasImage && state.session.mode === MACHINE_MODE.ALIGN,
    arePinsVisible: hasImage && state.session.mode === MACHINE_MODE.ALIGN,
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
  if (!state.session.image) {
    return createMainAction({
      kind: state.panel.intent === MACHINE_PANEL_INTENT.PASTE_ARMED
        ? MACHINE_PANEL_MAIN_ACTION.PASTE_ARMED
        : MACHINE_PANEL_MAIN_ACTION.PASTE,
      label: state.panel.intent === MACHINE_PANEL_INTENT.PASTE_ARMED ? "Paste…" : "Paste",
      intent: state.panel.intent,
      target: MACHINE_PANEL_MAIN_ACTION.PASTE,
    });
  }
  const canClearPins = (
    state.session.mode === MACHINE_MODE.ALIGN &&
    state.session.registration.pins.length > 0
  );
  if (canClearPins) {
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
      label: resolveClearPinsLabel(state.session.registration.pins.length),
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
