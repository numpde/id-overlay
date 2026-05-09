import {
  MACHINE_POINTER_GESTURE_KIND,
} from "./events.js";

export const MACHINE_RUNTIME_FACT_KIND = Object.freeze({
  POINTER_OBSERVED: "pointer-observed",
  POINTER_CLEARED: "pointer-cleared",
  GESTURE_BEGAN: "gesture-began",
  GESTURE_MOVED: "gesture-moved",
  GESTURE_ENDED: "gesture-ended",
  PASS_THROUGH_PRESSED: "pass-through-pressed",
  PASS_THROUGH_RELEASED: "pass-through-released",
  INPUT_INTERRUPTED: "input-interrupted",
});

const POINTER_GESTURE_KINDS = new Set(Object.values(MACHINE_POINTER_GESTURE_KIND));

export function createPointerObservedFact(screenPx) {
  return {
    kind: MACHINE_RUNTIME_FACT_KIND.POINTER_OBSERVED,
    screenPx: normalizeScreenPoint(screenPx),
  };
}

export function createPointerClearedFact() {
  return {
    kind: MACHINE_RUNTIME_FACT_KIND.POINTER_CLEARED,
    screenPx: null,
  };
}

export function createGestureBeganFact({ screenPx = null, gestureKind = null } = {}) {
  return {
    kind: MACHINE_RUNTIME_FACT_KIND.GESTURE_BEGAN,
    screenPx: normalizeScreenPoint(screenPx),
    gestureKind: normalizePointerGestureKind(gestureKind),
  };
}

export function createGestureMovedFact({ screenPx = null, gestureKind = null } = {}) {
  return {
    kind: MACHINE_RUNTIME_FACT_KIND.GESTURE_MOVED,
    screenPx: normalizeScreenPoint(screenPx),
    gestureKind: normalizePointerGestureKind(gestureKind),
  };
}

export function createGestureEndedFact({ screenPx = null } = {}) {
  return {
    kind: MACHINE_RUNTIME_FACT_KIND.GESTURE_ENDED,
    screenPx: normalizeScreenPoint(screenPx),
  };
}

export function createInputPassThroughPressedFact() {
  return {
    kind: MACHINE_RUNTIME_FACT_KIND.PASS_THROUGH_PRESSED,
  };
}

export function createInputPassThroughReleasedFact() {
  return {
    kind: MACHINE_RUNTIME_FACT_KIND.PASS_THROUGH_RELEASED,
  };
}

export function createInputInterruptedFact({ pointerScreenPx = null } = {}) {
  return {
    kind: MACHINE_RUNTIME_FACT_KIND.INPUT_INTERRUPTED,
    screenPx: normalizeScreenPoint(pointerScreenPx),
  };
}

function normalizePointerGestureKind(gestureKind) {
  return POINTER_GESTURE_KINDS.has(gestureKind) ? gestureKind : null;
}

function normalizeScreenPoint(screenPx) {
  if (!Number.isFinite(screenPx?.x) || !Number.isFinite(screenPx?.y)) {
    return null;
  }
  return {
    x: screenPx.x,
    y: screenPx.y,
  };
}
