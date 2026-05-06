import {
  PENDING_POINTER_SEQUENCE_ADVANCE_KIND,
  createPendingPointerSequenceSession,
} from "./pending-pointer-sequence.js";

export function createOverlayPointerSequenceRouter({
  onChange,
  overlayInteractions,
  consumeOverlayEvent,
}) {
  const pendingPointerSequence = createPendingPointerSequenceSession({ onChange });

  return {
    begin: pendingPointerSequence.begin,
    clear: pendingPointerSequence.clear,
    hasPending: pendingPointerSequence.hasPending,
    shouldListenGlobally: pendingPointerSequence.shouldListenGlobally,
    advanceGlobalPointerMove,
    consumePendingPointerUp,
  };

  function advanceGlobalPointerMove({ event, screenPoint }) {
    const outcome = pendingPointerSequence.advance(screenPoint);
    switch (outcome.kind) {
      case PENDING_POINTER_SEQUENCE_ADVANCE_KIND.NO_PENDING_SEQUENCE:
        return true;
      case PENDING_POINTER_SEQUENCE_ADVANCE_KIND.STILL_PENDING:
        consumeOverlayEvent(event);
        return false;
      case PENDING_POINTER_SEQUENCE_ADVANCE_KIND.ACTIVATED:
        return activatePendingPointerSequence({ event, sequence: outcome.sequence });
      default:
        return true;
    }
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
    if (!pendingPointerSequence.hasPending()) {
      return false;
    }
    pendingPointerSequence.clear();
    consumeOverlayEvent(event);
    return true;
  }
}
