import {
  selectIsRuntimeDragging,
} from "../../core/machine/selectors.js";

export function createOverlayGlobalPointerDispatcher({
  overlayInteractions,
  inputProjector,
  getRuntimeState,
  pointerSequenceRouter,
  consumeOverlayEvent,
  syncGlobalPointerListeners,
}) {
  // TODO(smell): Global pointer dispatch repeats runtime-drag predicates and
  // listener synchronization outside the gesture lifecycle. A single gesture
  // session should own global capture lifetime and expose facts to this boundary.
  return {
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
    shouldListenGlobally,
  };

  function handlePointerMove(event) {
    const screenPoint = inputProjector.screenPointFromEvent(event);
    if (!pointerSequenceRouter.advanceGlobalPointerMove({ event, screenPoint })) {
      return;
    }
    if (!selectIsRuntimeDragging(getRuntimeState())) {
      syncGlobalPointerListeners();
      return;
    }
    overlayInteractions.handlePointerMove(screenPoint);
    consumeOverlayEvent(event);
  }

  function handlePointerUp(event) {
    if (pointerSequenceRouter.consumePendingPointerUp(event)) {
      return;
    }
    if (!selectIsRuntimeDragging(getRuntimeState())) {
      syncGlobalPointerListeners();
      return;
    }
    overlayInteractions.handlePointerUp(inputProjector.screenPointFromEvent(event));
    consumeOverlayEvent(event);
  }

  function handlePointerCancel(event) {
    pointerSequenceRouter.clear();
    overlayInteractions.handlePointerCancel();
    consumeOverlayEvent(event);
  }

  function shouldListenGlobally() {
    return pointerSequenceRouter.shouldListenGlobally({
      hasActiveGesture: selectIsRuntimeDragging(getRuntimeState()),
    });
  }
}
