import {
  MACHINE_INPUT_OVERRIDE,
  MACHINE_POINTER_GESTURE_KIND,
} from "./events.js";
import {
  MACHINE_RUNTIME_FACT_KIND,
} from "./runtime-facts.js";
import {
  replaceInputRuntime,
} from "./state.js";
import { createTransitionResult } from "./transition-result.js";

export function transitionRuntimeFact(state, fact) {
  switch (fact?.kind) {
    case MACHINE_RUNTIME_FACT_KIND.POINTER_OBSERVED:
    case MACHINE_RUNTIME_FACT_KIND.POINTER_CLEARED:
      return applyPointerObservation(state, fact.screenPx);
    case MACHINE_RUNTIME_FACT_KIND.GESTURE_BEGAN:
    case MACHINE_RUNTIME_FACT_KIND.GESTURE_MOVED:
      return applyPointerGesture(state, {
        screenPx: fact.screenPx,
        gestureKind: fact.gestureKind,
      });
    case MACHINE_RUNTIME_FACT_KIND.GESTURE_ENDED:
      return clearPointerGesture(state, fact.screenPx);
    case MACHINE_RUNTIME_FACT_KIND.PASS_THROUGH_PRESSED:
      return applyInputOverride(state, MACHINE_INPUT_OVERRIDE.PASS_THROUGH);
    case MACHINE_RUNTIME_FACT_KIND.PASS_THROUGH_RELEASED:
      return applyInputOverride(state, null);
    case MACHINE_RUNTIME_FACT_KIND.INPUT_INTERRUPTED:
      return applyInputInterruption(state, { screenPx: fact.screenPx });
    default:
      return createTransitionResult({ state });
  }
}

function applyPointerObservation(state, screenPx) {
  return createTransitionResult({
    state: replaceInputRuntime(state, {
      pointerScreenPx: screenPx ?? null,
    }),
  });
}

function applyPointerGesture(state, { screenPx, gestureKind }) {
  if (!Object.values(MACHINE_POINTER_GESTURE_KIND).includes(gestureKind)) {
    return createTransitionResult({
      state,
    });
  }
  return createTransitionResult({
    state: replaceInputRuntime(state, {
      pointerScreenPx: screenPx ?? null,
      activeGesture: {
        kind: gestureKind,
      },
    }),
  });
}

function clearPointerGesture(state, screenPx) {
  return createTransitionResult({
    state: replaceInputRuntime(state, {
      pointerScreenPx: screenPx ?? null,
      activeGesture: null,
    }),
  });
}

function applyInputOverride(state, value) {
  const inputOverride = value === MACHINE_INPUT_OVERRIDE.PASS_THROUGH
    ? MACHINE_INPUT_OVERRIDE.PASS_THROUGH
    : null;
  return createTransitionResult({
    state: replaceInputRuntime(state, { inputOverride }),
  });
}

function applyInputInterruption(state, event) {
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
