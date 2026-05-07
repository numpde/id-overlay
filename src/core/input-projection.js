import {
  KEYBOARD_SHORTCUT_ACTION,
  WHEEL_MODE,
  resolveDragMode,
  resolveWheelMode,
  shouldIgnoreKeyboardShortcut,
} from "./interaction-policy.js";
import { INPUT_KEY } from "./input-facts.js";
import {
  selectIsRuntimeDragging,
  selectRuntimePointerScreenPx,
} from "./machine/selectors.js";
import {
  selectOverlayInputPolicy,
  selectOverlaySessionPolicy,
  shouldReleasePassThroughOverride,
} from "./machine/policy.js";

export function resolvePointerMoveProjection({
  machineState = null,
  state = null,
  runtime = null,
  isPointerOverOverlay = false,
  pointer = null,
} = {}) {
  const resolvedPointer = pointer ?? { button: 0, buttons: 0 };
  const hasActiveGesture = selectIsRuntimeDragging(runtime);
  const shouldTrackPointer = resolveCanOwnOverlayPointer({
    machineState,
    state,
    runtime,
    isPointerOverOverlay,
  }) && (resolvedPointer.buttons ?? 0) === 0;
  return {
    shouldTrackPointer,
    shouldDispatchPointerMove: hasActiveGesture || shouldTrackPointer,
    shouldConsumePointerMove: hasActiveGesture,
    shouldClearPointer: !hasActiveGesture && !shouldTrackPointer && Boolean(selectRuntimePointerScreenPx(runtime)),
  };
}

export function resolvePointerSequenceProjection({
  machineState = null,
  state = null,
  runtime = null,
  isPointerOverOverlay = false,
  pointer = null,
} = {}) {
  const resolvedPointer = pointer ?? { button: 0, buttons: 0 };
  const shouldOwnPointerSequence = (
    resolveCanOwnOverlayPointer({
      machineState,
      state,
      runtime,
      isPointerOverOverlay,
    }) &&
    resolvedPointer.button === 0
  );
  return {
    shouldOwnPointerSequence,
    dragMode: shouldOwnPointerSequence ? resolveDragMode(resolvedPointer) : null,
  };
}

export function resolveActivationProjection({
  machineState = null,
  state = null,
  runtime = null,
  isPointerOverOverlay = false,
} = {}) {
  const canOwnOverlayPointer = resolveCanOwnOverlayPointer({
    machineState,
    state,
    runtime,
    isPointerOverOverlay,
  });
  return {
    shouldConsumeClick: canOwnOverlayPointer,
    shouldTogglePin: canOwnOverlayPointer,
  };
}

export function resolveWheelProjection({
  machineState = null,
  state = null,
  runtime = null,
  isPointerOverOverlay = false,
  wheel = null,
  wheelMode = null,
} = {}) {
  const policy = resolveProjectionContext({
    machineState,
    state,
    runtime,
  });
  const resolvedWheel = wheel ?? {};
  const resolvedWheelMode = wheelMode ?? resolveWheelMode(resolvedWheel);
  const shouldHandle = (
    isPointerOverOverlay &&
    isWheelGestureAllowed({ policy, wheelMode: resolvedWheelMode })
  );
  return {
    wheelMode: resolvedWheelMode,
    shouldHandle,
    shouldIntercept: shouldHandle && resolvedWheelMode !== WHEEL_MODE.MAP_ZOOM,
    shouldConsume: shouldHandle && (
      resolvedWheelMode !== WHEEL_MODE.MAP_ZOOM ||
      policy.input.ownsPointerHitTesting
    ),
  };
}

function isWheelGestureAllowed({ policy, wheelMode }) {
  if (!policy.session.hasImage) {
    return false;
  }
  if (wheelMode === WHEEL_MODE.ADJUST_OPACITY) {
    return true;
  }
  if (policy.input.isPassThrough) {
    return false;
  }
  if (wheelMode === WHEEL_MODE.MAP_ZOOM) {
    return policy.input.ownsPointerHitTesting;
  }
  return policy.input.ownsPointerHitTesting;
}

export function resolveKeyboardProjection({
  machineState = null,
  state = null,
  runtime = null,
  keyboard = null,
} = {}) {
  const policy = resolveProjectionContext({
    machineState,
    state,
    runtime,
  });
  const shouldIgnore = !keyboard || shouldIgnoreKeyboardShortcut(keyboard);
  if (shouldIgnore || !policy.session.canEditOverlay) {
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

export function resolvePassThroughReleaseProjection({
  machineState = null,
  state = null,
  runtime = null,
  keyboard = null,
} = {}) {
  const canonicalState = resolveProjectionContext({
    machineState,
    state,
    runtime,
  }).canonicalState;
  return {
    shouldRelease: shouldReleasePassThroughOverride(canonicalState, runtime, keyboard),
  };
}

function resolveCanOwnOverlayPointer({
  machineState = null,
  state = null,
  runtime = null,
  isPointerOverOverlay = false,
}) {
  const policy = resolveProjectionContext({
    machineState,
    state,
    runtime,
  });
  return (
    isPointerOverOverlay &&
    policy.session.hasImage &&
    policy.input.ownsPointerHitTesting
  );
}

function resolveProjectionContext({
  machineState = null,
  state = null,
  runtime = null,
} = {}) {
  const canonicalState = machineState ?? state ?? {};
  return {
    canonicalState,
    session: selectOverlaySessionPolicy(canonicalState),
    input: selectOverlayInputPolicy(canonicalState, runtime),
  };
}
