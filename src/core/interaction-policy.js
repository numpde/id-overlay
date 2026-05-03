import { MACHINE_POINTER_GESTURE_KIND } from "./machine/events.js";

export const KEYBOARD_SHORTCUT_ACTION = Object.freeze({
  TOGGLE_PIN_CURRENT_POINTER: "toggle-pin-current-pointer",
  SWITCH_TO_TRACE: "switch-to-trace",
  ENABLE_PASS_THROUGH: "enable-pass-through",
});

export const DRAG_MODE = MACHINE_POINTER_GESTURE_KIND;

export const WHEEL_MODE = Object.freeze({
  MAP_ZOOM: "map-zoom",
  ZOOM_OVERLAY: "zoom-overlay",
  ROTATE_OVERLAY: "rotate-overlay",
  ADJUST_OPACITY: "adjust-opacity",
});

export function isMapPanDragMode(dragMode) {
  return dragMode === DRAG_MODE.MAP_PAN;
}

export function isKnownDragMode(dragMode) {
  return Object.values(DRAG_MODE).includes(dragMode);
}

export function isKnownWheelMode(wheelMode) {
  return Object.values(WHEEL_MODE).includes(wheelMode);
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
