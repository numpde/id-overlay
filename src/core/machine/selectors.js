import {
  MACHINE_FEEDBACK_KIND,
  MACHINE_MODE,
  MACHINE_PANEL_INTENT,
} from "./events.js";
import { peekRedoRecord, peekUndoRecord } from "./history.js";
import { isValidPanelRequestId } from "./state.js";

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
  return {
    mode: state.session.mode,
    isAlignEnabled: hasImage,
    isTraceEnabled: true,
    mainAction: resolveMainAction(state),
    canClearPins: hasImage && hasPins && !isTrace,
    canUndo: selectCanUndo(state),
    canRedo: selectCanRedo(state),
    undoTooltip: selectUndoTooltip(state),
    redoTooltip: selectRedoTooltip(state),
  };
}

export function selectStatus(state, feedback = null) {
  if (feedback?.message) {
    return feedback.message;
  }
  if (state.status.messageOverride?.message) {
    return state.status.messageOverride.message;
  }
  if (!state.session.image) {
    return "Paste an image to begin.";
  }
  if (state.panel.intent === MACHINE_PANEL_INTENT.PASTE_ARMED) {
    return "Paste image from clipboard.";
  }
  if (state.panel.intent === MACHINE_PANEL_INTENT.CLEAR_IMAGE_CONFIRM) {
    return "Confirm clearing the image.";
  }
  if (state.panel.intent === MACHINE_PANEL_INTENT.CLEAR_PINS_CONFIRM) {
    return "Confirm clearing pins.";
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
  return feedback.message ?? "";
}

function resolveMainAction(state) {
  if (!state.session.image) {
    return "paste";
  }
  if (state.panel.intent === MACHINE_PANEL_INTENT.CLEAR_IMAGE_CONFIRM) {
    return "confirm-clear-image";
  }
  return "clear-image";
}
