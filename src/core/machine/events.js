export const MACHINE_EVENT_KIND = Object.freeze({
  LOAD_IMAGE: "load-image",
  CLEAR_IMAGE: "clear-image",
  RESTORE_IMAGE_SESSION: "restore-image-session",
  SELECT_MODE: "select-mode",
  ADD_PIN: "add-pin",
  REMOVE_PIN: "remove-pin",
  CLEAR_PINS: "clear-pins",
  RESTORE_REGISTRATION: "restore-registration",
  FIT_OVERLAY: "fit-overlay",
  SET_PLACEMENT: "set-placement",
  UNDO: "undo",
  REDO: "redo",
  REQUEST_PANEL_INTENT: "request-panel-intent",
  CANCEL_PANEL_INTENT: "cancel-panel-intent",
  SET_STATUS_OVERRIDE: "set-status-override",
  CLEAR_STATUS_OVERRIDE: "clear-status-override",
});

export const MACHINE_MODE = Object.freeze({
  ALIGN: "align",
  TRACE: "trace",
});

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

export function createLoadImageEvent({ image, placement = null, requestId = null }) {
  return {
    type: MACHINE_EVENT_KIND.LOAD_IMAGE,
    image,
    placement,
    requestId,
  };
}

export function createCancelPanelIntentEvent({ requestId = null } = {}) {
  return {
    type: MACHINE_EVENT_KIND.CANCEL_PANEL_INTENT,
    requestId,
  };
}
