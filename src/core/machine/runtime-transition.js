import {
  MACHINE_INPUT_OVERRIDE,
  MACHINE_POINTER_GESTURE_KIND,
} from "./events.js";
import {
  replaceInputRuntime,
} from "./state.js";
import { createTransitionResult } from "./transition-result.js";

export function updatePointerRuntime(state, event) {
  return createTransitionResult({
    state: replaceInputRuntime(state, {
      pointerScreenPx: event.screenPx ?? null,
    }),
  });
}

export function beginPointerGesture(state, event) {
  if (!Object.values(MACHINE_POINTER_GESTURE_KIND).includes(event.gestureKind)) {
    return createTransitionResult({
      state,
    });
  }
  return createTransitionResult({
    state: replaceInputRuntime(state, {
      pointerScreenPx: event.screenPx ?? null,
      activeGesture: {
        kind: event.gestureKind,
      },
    }),
  });
}

export function endPointerGesture(state, event) {
  return createTransitionResult({
    state: replaceInputRuntime(state, {
      pointerScreenPx: event.screenPx ?? null,
      activeGesture: null,
    }),
  });
}

export function setInputOverride(state, event) {
  const inputOverride = event.inputOverride === MACHINE_INPUT_OVERRIDE.PASS_THROUGH
    ? MACHINE_INPUT_OVERRIDE.PASS_THROUGH
    : null;
  return createTransitionResult({
    state: replaceInputRuntime(state, { inputOverride }),
  });
}

export function resetInputRuntime(state, event) {
  return createTransitionResult({
    state: resetInputRuntimeState(state, { pointerScreenPx: event.screenPx }),
  });
}

export function resetInputRuntimeState(state, { pointerScreenPx = state.runtime.pointer.screenPx } = {}) {
  return replaceInputRuntime(state, {
    pointerScreenPx: pointerScreenPx ?? null,
    activeGesture: null,
    inputOverride: null,
  });
}
