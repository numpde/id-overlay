import {
  KEYBOARD_SHORTCUT_ACTION,
  WHEEL_MODE,
  resolveDragMode,
  resolveWheelMode,
  shouldIgnoreKeyboardShortcut,
} from "./interaction-policy.js";
import { INPUT_KEY } from "./input-facts.js";
import {
  selectOverlayPolicy,
  shouldReleasePassThroughOverride,
} from "./machine/policy.js";

export function resolveInputProjection({
  machineState = null,
  state = null,
  runtime = null,
  isPointerOverOverlay = false,
  pointer = null,
  wheel = null,
  keyboard = null,
  wheelMode = null,
} = {}) {
  // TODO(smell): Input projection returns pointer, wheel, keyboard, activation,
  // and pass-through release policy in one aggregate. Split per-device
  // projection helpers once overlay input routing no longer asks for the whole
  // bundle on every DOM event.
  const canonicalState = machineState ?? state ?? {};
  const overlayPolicy = selectOverlayPolicy(canonicalState, runtime);
  const resolvedPointer = pointer ?? { button: 0, buttons: 0 };
  const resolvedWheel = wheel ?? {};
  const resolvedWheelMode = wheelMode ?? resolveWheelMode(resolvedWheel);
  const canOwnOverlayPointer = (
    isPointerOverOverlay &&
    overlayPolicy.hasImage &&
    overlayPolicy.ownsPointerHitTesting
  );
  const shouldOwnPointerSequence = canOwnOverlayPointer && resolvedPointer.button === 0;

  return {
    overlayPolicy,
    pointerMove: {
      shouldTrackPointer: canOwnOverlayPointer && (resolvedPointer.buttons ?? 0) === 0,
    },
    pointerSequence: {
      shouldOwnPointerSequence,
      dragMode: shouldOwnPointerSequence ? resolveDragMode(resolvedPointer) : null,
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
    keyboard: resolveKeyboardProjection({ keyboard, overlayPolicy }),
    passThroughRelease: {
      shouldRelease: shouldReleasePassThroughOverride(canonicalState, runtime, keyboard),
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

function resolveKeyboardProjection({ keyboard, overlayPolicy }) {
  const shouldIgnore = !keyboard || shouldIgnoreKeyboardShortcut(keyboard);
  if (shouldIgnore || !overlayPolicy.canEditOverlay) {
    return {
      action: null,
      shouldIgnore,
    };
  }
  if (keyboard.key === INPUT_KEY.P) {
    return {
      action: KEYBOARD_SHORTCUT_ACTION.TOGGLE_PIN_CURRENT_POINTER,
      shouldIgnore: false,
    };
  }
  if (keyboard.key === INPUT_KEY.ESCAPE) {
    return {
      action: KEYBOARD_SHORTCUT_ACTION.SWITCH_TO_TRACE,
      shouldIgnore: false,
    };
  }
  if (keyboard.key === INPUT_KEY.SPACE) {
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
