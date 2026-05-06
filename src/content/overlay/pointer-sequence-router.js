import {
  beginOverlayPointerSequence,
  clearOverlayPointerSequence,
  createInitialOverlayPointerSequenceState,
  hasPendingOverlayPointerSequence,
  resolveOverlayPointerSequenceActivation,
} from "../../core/overlay-pointer-sequence.js";

export function createOverlayPointerSequenceRouter({
  onChange,
  overlayInteractions,
  consumeOverlayEvent,
}) {
  let state = createInitialOverlayPointerSequenceState();

  return {
    begin,
    clear,
    hasPending,
    shouldListenGlobally,
    advanceGlobalPointerMove,
    consumePendingPointerUp,
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

  function shouldListenGlobally({ hasActiveGesture = false } = {}) {
    return hasPending() || hasActiveGesture;
  }

  function advanceGlobalPointerMove({ event, screenPoint }) {
    if (!hasPending()) {
      return true;
    }

    const activation = resolveOverlayPointerSequenceActivation({
      state,
      screenPoint,
    });
    if (!activation.shouldStartDrag) {
      consumeOverlayEvent(event);
      return false;
    }

    clear();
    return activatePendingPointerSequence({ event, sequence: activation.sequence });
  }

  function activatePendingPointerSequence({ event, sequence }) {
    overlayInteractions.handlePointerMove(sequence.startScreenPoint);
    if (overlayInteractions.handlePointerDown({
      button: sequence.button,
      screenPoint: sequence.startScreenPoint,
      dragMode: sequence.dragMode,
    })) {
      return true;
    }
    consumeOverlayEvent(event);
    return false;
  }

  function consumePendingPointerUp(event) {
    if (!hasPending()) {
      return false;
    }
    clear();
    consumeOverlayEvent(event);
    return true;
  }

  function setState(nextState) {
    if (state === nextState) {
      return;
    }
    state = nextState;
    onChange?.(state);
  }
}
