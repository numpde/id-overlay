export const OVERLAY_POINTER_SEQUENCE_DEFAULTS = Object.freeze({
  dragStartDistancePx: 4,
});

export const OVERLAY_POINTER_SEQUENCE_KIND = Object.freeze({
  IDLE: "idle",
  PENDING: "pending",
});

const IDLE_SEQUENCE_STATE = Object.freeze({
  kind: OVERLAY_POINTER_SEQUENCE_KIND.IDLE,
});

export function createInitialOverlayPointerSequenceState() {
  return IDLE_SEQUENCE_STATE;
}

export function beginOverlayPointerSequence({
  button,
  dragMode,
  startScreenPoint,
}) {
  return {
    kind: OVERLAY_POINTER_SEQUENCE_KIND.PENDING,
    button,
    dragMode,
    startScreenPoint,
  };
}

export function clearOverlayPointerSequence() {
  return IDLE_SEQUENCE_STATE;
}

export function hasPendingOverlayPointerSequence(state) {
  return state?.kind === OVERLAY_POINTER_SEQUENCE_KIND.PENDING;
}

export function resolveOverlayPointerSequenceActivation({
  state,
  screenPoint,
  dragStartDistancePx = OVERLAY_POINTER_SEQUENCE_DEFAULTS.dragStartDistancePx,
}) {
  if (!hasPendingOverlayPointerSequence(state)) {
    return {
      shouldStartDrag: false,
      sequence: null,
    };
  }

  const deltaX = screenPoint.x - state.startScreenPoint.x;
  const deltaY = screenPoint.y - state.startScreenPoint.y;
  const distanceSquared = (deltaX * deltaX) + (deltaY * deltaY);
  const dragStartDistanceSquared = dragStartDistancePx * dragStartDistancePx;

  return {
    shouldStartDrag: distanceSquared >= dragStartDistanceSquared,
    sequence: state,
  };
}
