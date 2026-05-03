import { SESSION_MODE } from "../session.js";

export const MACHINE_EVENT_KIND = Object.freeze({
  LOAD_IMAGE: "load-image",
  CLEAR_IMAGE: "clear-image",
  RESTORE_IMAGE_SESSION: "restore-image-session",
  SELECT_MODE: "select-mode",
  SET_OPACITY: "set-opacity",
  ADD_PIN: "add-pin",
  REMOVE_PIN: "remove-pin",
  CLEAR_PINS: "clear-pins",
  RESTORE_REGISTRATION: "restore-registration",
  FIT_OVERLAY: "fit-overlay",
  SET_PLACEMENT: "set-placement",
  SYNC_PLACEMENT: "sync-placement",
  UNDO: "undo",
  REDO: "redo",
  REQUEST_PANEL_INTENT: "request-panel-intent",
  CANCEL_PANEL_INTENT: "cancel-panel-intent",
  REPORT_FEEDBACK: "report-feedback",
  SET_STATUS_OVERRIDE: "set-status-override",
  CLEAR_STATUS_OVERRIDE: "clear-status-override",
});

export const MACHINE_MODE = SESSION_MODE;

export const MACHINE_PANEL_INTENT = Object.freeze({
  IDLE: "idle",
  PASTE_ARMED: "paste-armed",
  CLEAR_PINS_CONFIRM: "clear-pins-confirm",
  CLEAR_IMAGE_CONFIRM: "clear-image-confirm",
});

export const MACHINE_HISTORY_KIND = Object.freeze({
  LOAD_IMAGE: "load-image",
  CLEAR_IMAGE: "clear-image",
  ADD_PIN: "add-pin",
  REMOVE_PIN: "remove-pin",
  CLEAR_PINS: "clear-pins",
  FIT_OVERLAY: "fit-overlay",
  MOVE_OVERLAY: "move-overlay",
  ROTATE_OVERLAY: "rotate-overlay",
  SCALE_OVERLAY: "scale-overlay",
});

export const MACHINE_FEEDBACK_KIND = Object.freeze({
  NONE: "none",
  IMAGE_LOADED: "image-loaded",
  IMAGE_CLEARED: "image-cleared",
  IMAGE_RESTORED: "image-restored",
  MODE_SELECTED: "mode-selected",
  PIN_ADDED: "pin-added",
  PIN_REMOVED: "pin-removed",
  PINS_CLEARED: "pins-cleared",
  PINS_RESTORED: "pins-restored",
  OVERLAY_FITTED: "overlay-fitted",
  PLACEMENT_CHANGED: "placement-changed",
  PASTE_CANCELLED: "paste-cancelled",
  CLIPBOARD_MISSING_IMAGE: "clipboard-missing-image",
  CLIPBOARD_IMAGE_UNREADABLE: "clipboard-image-unreadable",
  RUNTIME_ERROR: "runtime-error",
  UNDO: "undo",
  REDO: "redo",
  UNDO_EMPTY: "undo-empty",
  REDO_EMPTY: "redo-empty",
  PANEL_INTENT_CHANGED: "panel-intent-changed",
  STATUS_OVERRIDE_CHANGED: "status-override-changed",
});

export const MACHINE_PLACEMENT_EDIT_KIND = Object.freeze({
  MOVE: "move",
  ROTATE: "rotate",
  SCALE: "scale",
});

export function createLoadImageEvent({
  image,
  placement = null,
  requestId = null,
  feedbackMessage = "",
} = {}) {
  return {
    type: MACHINE_EVENT_KIND.LOAD_IMAGE,
    image,
    placement,
    requestId,
    feedbackMessage,
  };
}

export function createCancelPanelIntentEvent({
  requestId = null,
  feedbackKind = MACHINE_FEEDBACK_KIND.PANEL_INTENT_CHANGED,
  feedbackMessage = "",
} = {}) {
  return {
    type: MACHINE_EVENT_KIND.CANCEL_PANEL_INTENT,
    requestId,
    feedbackKind,
    feedbackMessage,
  };
}

export function createReportFeedbackEvent({
  feedbackKind = MACHINE_FEEDBACK_KIND.NONE,
  message = "",
} = {}) {
  return {
    type: MACHINE_EVENT_KIND.REPORT_FEEDBACK,
    feedbackKind,
    message,
  };
}
