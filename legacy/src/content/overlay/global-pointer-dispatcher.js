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
    routeActiveGlobalPointer(event, () => {
      overlayInteractions.handlePointerMove(screenPoint);
      consumeOverlayEvent(event);
    });
  }

  function handlePointerUp(event) {
    if (pointerSequenceRouter.consumePendingPointerUp(event)) {
      return;
    }
    routeActiveGlobalPointer(event, () => {
      overlayInteractions.handlePointerUp(inputProjector.screenPointFromEvent(event));
      consumeOverlayEvent(event);
    });
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

  function routeActiveGlobalPointer(event, dispatchActiveGesture) {
    if (!selectIsRuntimeDragging(getRuntimeState())) {
      syncGlobalPointerListeners();
      return;
    }
    dispatchActiveGesture(event);
  }
}
