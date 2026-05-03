import {
  KEYBOARD_SHORTCUT_ACTION,
  WHEEL_MODE,
  resolveDragMode,
  resolveWheelMode,
  shouldIgnoreKeyboardShortcut,
} from "./interaction-policy.js";
import {
  selectIsInputPassThroughActive,
  selectOverlayPolicy,
} from "./machine/selectors.js";
import { isAlignMode } from "./session.js";

export function resolveInputProjection({
  machineState = null,
  state = null,
  runtime = null,
  isPointerOverOverlay = false,
  buttons = 0,
  button = 0,
  shiftKey = false,
  altKey = false,
  ctrlKey = false,
  wheelMode = null,
  event = null,
} = {}) {
  const session = machineState?.session ?? state ?? {};
  const canonicalState = machineState ?? session;
  const overlayPolicy = selectOverlayPolicy(canonicalState, runtime);
  const resolvedWheelMode = wheelMode ?? resolveWheelMode({ shiftKey, altKey, ctrlKey });
  const canOwnOverlayPointer = (
    isPointerOverOverlay &&
    overlayPolicy.hasImage &&
    overlayPolicy.ownsPointerHitTesting
  );
  const shouldOwnPointerSequence = canOwnOverlayPointer && button === 0;

  return {
    overlayPolicy,
    pointerMove: {
      shouldTrackPointer: canOwnOverlayPointer && buttons === 0,
    },
    pointerSequence: {
      shouldOwnPointerSequence,
      dragMode: shouldOwnPointerSequence ? resolveDragMode({ shiftKey }) : null,
    },
    activation: {
      shouldConsumeClick: canOwnOverlayPointer,
      shouldTogglePin: canOwnOverlayPointer,
    },
    wheel: resolveWheelProjection({
      overlayPolicy,
      isPointerOverOverlay,
      wheelMode: resolvedWheelMode,
    }),
    keyboard: resolveKeyboardProjection({ event, overlayPolicy }),
    passThroughRelease: {
      shouldRelease: resolvePassThroughOverrideRelease({ event, session, runtime }),
    },
  };
}

function resolveWheelProjection({ overlayPolicy, isPointerOverOverlay, wheelMode }) {
  const shouldHandle = (
    isPointerOverOverlay &&
    isWheelGestureAllowed({ overlayPolicy, wheelMode })
  );
  return {
    wheelMode,
    shouldHandle,
    shouldIntercept: shouldHandle && wheelMode !== WHEEL_MODE.MAP_ZOOM,
    shouldConsume: shouldHandle && (
      wheelMode !== WHEEL_MODE.MAP_ZOOM ||
      overlayPolicy.ownsPointerHitTesting
    ),
  };
}

function isWheelGestureAllowed({ overlayPolicy, wheelMode }) {
  if (!overlayPolicy.hasImage) {
    return false;
  }
  if (wheelMode === WHEEL_MODE.ADJUST_OPACITY) {
    return true;
  }
  if (overlayPolicy.isPassThrough) {
    return false;
  }
  if (wheelMode === WHEEL_MODE.MAP_ZOOM) {
    return overlayPolicy.ownsPointerHitTesting;
  }
  return overlayPolicy.ownsPointerHitTesting;
}

function resolveKeyboardProjection({ event, overlayPolicy }) {
  const shouldIgnore = !event || shouldIgnoreKeyboardShortcut(event);
  if (shouldIgnore || !overlayPolicy.canEditOverlay) {
    return {
      action: null,
      shouldIgnore,
    };
  }
  if (event.code === "KeyP") {
    return {
      action: KEYBOARD_SHORTCUT_ACTION.TOGGLE_PIN_CURRENT_POINTER,
      shouldIgnore: false,
    };
  }
  if (event.code === "Escape") {
    return {
      action: KEYBOARD_SHORTCUT_ACTION.SWITCH_TO_TRACE,
      shouldIgnore: false,
    };
  }
  if (event.code === "Space") {
    return {
      action: KEYBOARD_SHORTCUT_ACTION.ENABLE_PASS_THROUGH,
      shouldIgnore: false,
    };
  }
  return {
    action: null,
    shouldIgnore: false,
  };
}

function resolvePassThroughOverrideRelease({ event, session, runtime }) {
  return (
    event?.code === "Space" &&
    (isAlignMode(session.mode) || selectIsInputPassThroughActive(runtime))
  );
}
