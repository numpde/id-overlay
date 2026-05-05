import {
  MACHINE_INPUT_OVERRIDE,
  MACHINE_POINTER_GESTURE_KIND,
} from "./events.js";
import {
  replaceInputRuntime,
} from "./state.js";
import { createTransitionResult } from "./transition-result.js";

export function updatePointerRuntime(state, event) {
  // TODO(smell): Pointer runtime is updated through a low-level mutation event
  // authored by content. The final ingress should accept observed pointer facts
  // and keep runtime mutation details private.
  return createTransitionResult({
    state: replaceInputRuntime(state, {
      pointerScreenPx: event.screenPx ?? null,
    }),
  });
}

export function beginPointerGesture(state, event) {
  // TODO(smell): Gesture lifecycle transitions are public mutation commands
  // today. They should be private consequences of observed pointer/user intent
  // facts once the interaction boundary is cut over.
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
  // TODO(smell): Input override is directly commanded from keyboard handling.
  // The final shape should interpret user pass-through press/release facts here
  // instead of exposing SET_INPUT_OVERRIDE outside the machine.
  const inputOverride = event.inputOverride === MACHINE_INPUT_OVERRIDE.PASS_THROUGH
    ? MACHINE_INPUT_OVERRIDE.PASS_THROUGH
    : null;
  return createTransitionResult({
    state: replaceInputRuntime(state, { inputOverride }),
  });
}

export function resetInputRuntime(state, event) {
  // TODO(smell): Runtime reset is an externally callable mutation command. It
  // should become a private cleanup consequence of blur/error/gesture-end facts.
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
