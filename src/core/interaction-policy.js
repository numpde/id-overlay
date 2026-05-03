export const KEYBOARD_SHORTCUT_ACTION = Object.freeze({
  // Final semantic-history shape: shortcut actions are adapter vocabulary.
  // They should map to canonical UI events before causing user-visible state
  // changes.
  TOGGLE_PIN_CURRENT_POINTER: "toggle-pin-current-pointer",
  SWITCH_TO_TRACE: "switch-to-trace",
  ENABLE_PASS_THROUGH: "enable-pass-through",
});

export const INTERACTION_EVENT = Object.freeze({
  RUNTIME_ERROR: "runtime-error",
});

export const PIN_RESULT_ACTION = Object.freeze({
  ADDED: "added",
  REMOVED: "removed",
});

export const PIN_RESULT_REASON = Object.freeze({
  POINTER_OUTSIDE_IMAGE: "pointer-outside-image",
  NOT_ALIGN_MODE: "not-align-mode",
  NO_IMAGE: "no-image",
  NO_POINTER: "no-pointer",
});

export const SOLVE_RESULT_REASON = Object.freeze({
  INSUFFICIENT_PINS: "insufficient-pins",
  SOLVE_FAILED: "solve-failed",
});

export const DRAG_MODE = Object.freeze({
  MOVE_OVERLAY: "move-overlay",
  MAP_PAN: "map-pan",
});

export const WHEEL_MODE = Object.freeze({
  MAP_ZOOM: "map-zoom",
  ZOOM_OVERLAY: "zoom-overlay",
  ROTATE_OVERLAY: "rotate-overlay",
  ADJUST_OPACITY: "adjust-opacity",
});

export function isMapPanDragMode(dragMode) {
  return dragMode === DRAG_MODE.MAP_PAN;
}

export function doesDragEditPlacement(dragMode) {
  return dragMode === DRAG_MODE.MOVE_OVERLAY;
}

export function doesWheelEditPlacement(wheelMode) {
  return (
    wheelMode === WHEEL_MODE.ZOOM_OVERLAY ||
    wheelMode === WHEEL_MODE.ROTATE_OVERLAY
  );
}

export function doesWheelEditOpacity(wheelMode) {
  return wheelMode === WHEEL_MODE.ADJUST_OPACITY;
}

export function resolveDragMode({ shiftKey }) {
  if (shiftKey) {
    return DRAG_MODE.MOVE_OVERLAY;
  }
  return DRAG_MODE.MAP_PAN;
}

export function resolveWheelMode({ shiftKey, altKey, ctrlKey }) {
  if (altKey) {
    return WHEEL_MODE.ADJUST_OPACITY;
  }
  if (ctrlKey) {
    return WHEEL_MODE.ROTATE_OVERLAY;
  }
  if (shiftKey) {
    return WHEEL_MODE.ZOOM_OVERLAY;
  }
  return WHEEL_MODE.MAP_ZOOM;
}

export function shouldIgnoreKeyboardShortcut(event) {
  if (event.defaultPrevented) {
    return true;
  }
  if (event.metaKey || event.ctrlKey || event.altKey) {
    return true;
  }
  const target = event.composedPath?.()[0] ?? event.target ?? null;
  return isEditableTarget(target);
}

function isEditableTarget(target) {
  if (!target || typeof target !== "object") {
    return false;
  }
  if (target.isContentEditable) {
    return true;
  }
  const tagName = typeof target.tagName === "string" ? target.tagName.toUpperCase() : "";
  if (tagName === "TEXTAREA" || tagName === "SELECT") {
    return true;
  }
  if (tagName !== "INPUT") {
    return false;
  }
  const type = typeof target.type === "string" ? target.type.toLowerCase() : "";
  return !["button", "range", "checkbox", "radio", "submit", "reset"].includes(type);
}
