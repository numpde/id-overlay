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

export function resolveDragMode(pointer = {}) {
  if (pointer.modifiers?.shift) {
    return DRAG_MODE.MOVE_OVERLAY;
  }
  return DRAG_MODE.MAP_PAN;
}

export function resolveWheelMode(wheel = {}) {
  const modifiers = wheel.modifiers ?? {};
  if (modifiers.alt) {
    return WHEEL_MODE.ADJUST_OPACITY;
  }
  if (modifiers.ctrl) {
    return WHEEL_MODE.ROTATE_OVERLAY;
  }
  if (modifiers.shift) {
    return WHEEL_MODE.ZOOM_OVERLAY;
  }
  return WHEEL_MODE.MAP_ZOOM;
}

export function shouldIgnoreKeyboardShortcut(keyboard = null) {
  if (!keyboard) {
    return true;
  }
  if (keyboard.isDefaultPrevented) {
    return true;
  }
  if (keyboard.modifiers?.meta || keyboard.modifiers?.ctrl || keyboard.modifiers?.alt) {
    return true;
  }
  return keyboard.isEditableTarget;
}
