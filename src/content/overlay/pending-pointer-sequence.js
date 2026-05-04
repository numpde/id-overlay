import {
  beginOverlayPointerSequence,
  clearOverlayPointerSequence,
  createInitialOverlayPointerSequenceState,
  hasPendingOverlayPointerSequence,
  resolveOverlayPointerSequenceActivation,
} from "../../core/overlay-pointer-sequence.js";

export const PENDING_POINTER_SEQUENCE_ADVANCE_KIND = Object.freeze({
  NO_PENDING_SEQUENCE: "no-pending-sequence",
  STILL_PENDING: "still-pending",
  ACTIVATED: "activated",
});

export function createPendingPointerSequenceSession({ onChange } = {}) {
  let state = createInitialOverlayPointerSequenceState();

  return {
    begin,
    clear,
    hasPending,
    advance,
    shouldListenGlobally,
  };

  function begin({
    button,
    dragMode,
    startScreenPoint,
  }) {
    setState(beginOverlayPointerSequence({
      button,
      dragMode,
      startScreenPoint,
    }));
  }

  function clear() {
    setState(clearOverlayPointerSequence());
  }

  function hasPending() {
    return hasPendingOverlayPointerSequence(state);
  }

  function advance(screenPoint) {
    if (!hasPending()) {
      return {
        kind: PENDING_POINTER_SEQUENCE_ADVANCE_KIND.NO_PENDING_SEQUENCE,
        sequence: null,
      };
    }
    const activation = resolveOverlayPointerSequenceActivation({
      state,
      screenPoint,
    });
    if (!activation.shouldStartDrag) {
      return {
        kind: PENDING_POINTER_SEQUENCE_ADVANCE_KIND.STILL_PENDING,
        sequence: activation.sequence,
      };
    }
    clear();
    return {
      kind: PENDING_POINTER_SEQUENCE_ADVANCE_KIND.ACTIVATED,
      sequence: activation.sequence,
    };
  }

  function shouldListenGlobally({ hasActiveGesture = false } = {}) {
    return hasPending() || hasActiveGesture;
  }

  function setState(nextState) {
    if (state === nextState) {
      return;
    }
    state = nextState;
    onChange?.(state);
  }
}
