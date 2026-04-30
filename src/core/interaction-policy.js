import { hasOverlayImageSession } from "./state.js";
import {
  INTERACTION_MODE,
  isAlignMode,
  isTraceMode,
  nextMode,
} from "./interaction-mode.js";

export {
  INTERACTION_MODE,
  isAlignMode,
  isTraceMode,
  nextMode,
} from "./interaction-mode.js";

export const KEYBOARD_SHORTCUT_ACTION = Object.freeze({
  TOGGLE_PIN_CURRENT_POINTER: "toggle-pin-current-pointer",
  SWITCH_TO_TRACE: "switch-to-trace",
  ENABLE_PASS_THROUGH: "enable-pass-through",
});

export const INTERACTION_EVENT = Object.freeze({
  PIN_RESULT: "pin-result",
  SOLVE_RESULT: "solve-result",
  PINS_CLEARED: "pins-cleared",
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

export function canEditRegistration(state) {
  return hasOverlayImageSession(state) && isAlignMode(state?.mode);
}

export function canCaptureOverlayPointer({ state, runtime }) {
  return canEditRegistration(state) && !runtime?.isPassThroughActive;
}

export function canTrackOverlayPointer({ state, runtime }) {
  return canCaptureOverlayPointer({ state, runtime });
}

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

export function canHandleWheelGesture({ state, runtime, wheelMode }) {
  if (!hasOverlayImageSession(state) || runtime?.isPassThroughActive) {
    return false;
  }
  if (wheelMode === WHEEL_MODE.ADJUST_OPACITY) {
    return true;
  }
  if (wheelMode === WHEEL_MODE.MAP_ZOOM) {
    return canCaptureOverlayPointer({ state, runtime });
  }
  return canEditRegistration(state) && !runtime?.isPassThroughActive;
}

export function resolveOverlayWheelPolicy({
  state,
  runtime,
  shiftKey,
  altKey,
  ctrlKey,
}) {
  const wheelMode = resolveWheelMode({ shiftKey, altKey, ctrlKey });
  return {
    wheelMode,
    shouldIntercept: (
      wheelMode !== WHEEL_MODE.MAP_ZOOM &&
      canHandleWheelGesture({ state, runtime, wheelMode })
    ),
  };
}

export function canToggleOverlayPin({
  state,
  runtime,
  isPointerOverOverlay,
}) {
  return (
    isPointerOverOverlay &&
    hasOverlayImageSession(state) &&
    canTrackOverlayPointer({ state, runtime })
  );
}

export function resolveOverlayPointerMovePolicy({
  state,
  runtime,
  isPointerOverOverlay,
  buttons = 0,
}) {
  return {
    shouldTrackPointer: (
      isPointerOverOverlay &&
      hasOverlayImageSession(state) &&
      canTrackOverlayPointer({ state, runtime }) &&
      buttons === 0
    ),
  };
}

export function resolveOverlayPointerSequencePolicy({
  state,
  runtime,
  isPointerOverOverlay,
  button = 0,
  shiftKey = false,
}) {
  const shouldOwnPointerSequence = (
    isPointerOverOverlay &&
    hasOverlayImageSession(state) &&
    canCaptureOverlayPointer({ state, runtime }) &&
    button === 0
  );
  return {
    shouldOwnPointerSequence,
    dragMode: shouldOwnPointerSequence ? resolveDragMode({ shiftKey }) : null,
  };
}

export function resolveOverlayActivationPolicy({
  state,
  runtime,
  isPointerOverOverlay,
}) {
  const canTogglePin = canToggleOverlayPin({
    state,
    runtime,
    isPointerOverOverlay,
  });
  return {
    shouldConsumeClick: canTogglePin,
    shouldTogglePin: canTogglePin,
  };
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

export function resolveKeyboardShortcut({ event, state }) {
  if (shouldIgnoreKeyboardShortcut(event)) {
    return null;
  }
  if (!canEditRegistration(state)) {
    return null;
  }
  if (event.code === "KeyP") {
    return KEYBOARD_SHORTCUT_ACTION.TOGGLE_PIN_CURRENT_POINTER;
  }
  if (event.code === "Escape") {
    return KEYBOARD_SHORTCUT_ACTION.SWITCH_TO_TRACE;
  }
  if (event.code === "Space") {
    return KEYBOARD_SHORTCUT_ACTION.ENABLE_PASS_THROUGH;
  }
  return null;
}

export function shouldReleasePassThrough({ event, state, runtime }) {
  return (
    event.code === "Space" &&
    (isAlignMode(state.mode) || runtime.isPassThroughActive)
  );
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
