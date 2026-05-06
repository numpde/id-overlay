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
