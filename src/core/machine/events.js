import { SESSION_MODE } from "../session.js";

export const MACHINE_EVENT_KIND = Object.freeze({
  // TODO(smell): This public vocabulary mixes user intents, internal replay
  // commands, runtime sensor updates, and durable domain mutations. Split the
  // final ingress into externally-authored user/fact events and private
  // machine-internal transition/replay events.
  LOAD_IMAGE: "load-image",
  CLEAR_IMAGE: "clear-image",
  RESTORE_IMAGE_SESSION: "restore-image-session",
  SELECT_MODE: "select-mode",
  UPDATE_POINTER_RUNTIME: "update-pointer-runtime",
  BEGIN_POINTER_GESTURE: "begin-pointer-gesture",
  END_POINTER_GESTURE: "end-pointer-gesture",
  SET_INPUT_OVERRIDE: "set-input-override",
  RESET_INPUT_RUNTIME: "reset-input-runtime",
  SET_OPACITY: "set-opacity",
  TOGGLE_PIN: "toggle-pin",
  ADD_PIN: "add-pin",
  REMOVE_PIN: "remove-pin",
  CLEAR_PINS: "clear-pins",
  RESTORE_REGISTRATION: "restore-registration",
  FIT_OVERLAY: "fit-overlay",
  BEGIN_PLACEMENT_EDIT: "begin-placement-edit",
  PREVIEW_PLACEMENT_EDIT: "preview-placement-edit",
  COMMIT_PLACEMENT_EDIT: "commit-placement-edit",
  CANCEL_PLACEMENT_EDIT: "cancel-placement-edit",
  APPLY_PLACEMENT_EDIT: "apply-placement-edit",
  RESTORE_PLACEMENT: "restore-placement",
  UNDO: "undo",
  REDO: "redo",
  REQUEST_PANEL_INTENT: "request-panel-intent",
  CANCEL_PANEL_INTENT: "cancel-panel-intent",
  REPORT_STATUS_NOTICE: "report-status-notice",
  CLEAR_STATUS_NOTICE: "clear-status-notice",
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

export const MACHINE_STATUS_NOTICE_KIND = Object.freeze({
  IMAGE_LOADED: "image-loaded",
  IMAGE_CLEARED: "image-cleared",
  IMAGE_RESTORED: "image-restored",
  MODE_SELECTED: "mode-selected",
  PIN_ADDED: "pin-added",
  PIN_REMOVED: "pin-removed",
  PINS_CLEARED: "pins-cleared",
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
});

export const MACHINE_PLACEMENT_EDIT_KIND = Object.freeze({
  MOVE: "move",
  ROTATE: "rotate",
  SCALE: "scale",
});

export const MACHINE_POINTER_GESTURE_KIND = Object.freeze({
  MAP_PAN: "map-pan",
  MOVE_OVERLAY: "move-overlay",
});

export const MACHINE_INPUT_OVERRIDE = Object.freeze({
  PASS_THROUGH: "pass-through",
});

export const MACHINE_PASTE_SOURCE = Object.freeze({
  CLIPBOARD_API: "clipboard-api",
  MANUAL_PASTE: "manual-paste",
});

// TODO(smell): Event vocabulary and a few ad hoc event constructors live in the
// same file. The final event boundary should expose constructors only for
// external user/fact events; internal mutation/replay events should stay private
// to transition modules.
export function createLoadImageEvent({
  image,
  placement = null,
  requestId = null,
} = {}) {
  return {
    type: MACHINE_EVENT_KIND.LOAD_IMAGE,
    image,
    placement,
    requestId,
  };
}

export function createCancelPanelIntentEvent({
  requestId = null,
  noticeKind = null,
  noticePayload = null,
} = {}) {
  return {
    type: MACHINE_EVENT_KIND.CANCEL_PANEL_INTENT,
    requestId,
    noticeKind,
    noticePayload,
  };
}

export function createReportStatusNoticeEvent({
  noticeKind,
  noticePayload = null,
} = {}) {
  return {
    type: MACHINE_EVENT_KIND.REPORT_STATUS_NOTICE,
    noticeKind,
    noticePayload,
  };
}
