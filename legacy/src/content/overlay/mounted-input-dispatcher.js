import {
  createPointerInputFactFromEvent,
  createWheelInputFactFromEvent,
} from "../input-event-facts.js";

export function createOverlayMountedInputDispatcher({
  overlayInteractions,
  inputProjector,
  pointerSequenceRouter,
  consumeOverlayEvent,
}) {
  return {
    handlePointerMove,
    handlePointerLeave,
    handlePointerDown,
    handleClick,
    handleDoubleClick,
    handleWheel,
  };

  function handlePointerMove(event) {
    if (pointerSequenceRouter.hasPending()) {
      return;
    }
    const screenPoint = inputProjector.screenPointFromEvent(event);
    const pointerPolicy = inputProjector.resolveMountedPointerMoveProjection(screenPoint, {
      pointer: createPointerInputFactFromEvent(event),
    });
    if (pointerPolicy.shouldDispatchPointerMove) {
      overlayInteractions.handlePointerMove(screenPoint);
      if (pointerPolicy.shouldConsumePointerMove) {
        consumeOverlayEvent(event);
      }
      return;
    }
    if (pointerPolicy.shouldClearPointer) {
      overlayInteractions.handlePointerLeave();
    }
  }

  function handlePointerLeave() {
    const pointerPolicy = inputProjector.resolveMountedPointerLeaveProjection();
    if (pointerPolicy.shouldConsumePointerMove) {
      return;
    }
    overlayInteractions.handlePointerLeave();
  }

  function handlePointerDown(event) {
    const screenPoint = inputProjector.screenPointFromEvent(event);
    const pointerPolicy = inputProjector.resolveMountedPointerSequenceProjection(screenPoint, {
      pointer: createPointerInputFactFromEvent(event),
    });
    if (!pointerPolicy.shouldOwnPointerSequence) {
      return;
    }
    pointerSequenceRouter.begin({
      button: event.button,
      dragMode: pointerPolicy.dragMode,
      startScreenPoint: screenPoint,
    });
    consumeOverlayEvent(event);
  }

  function handleDoubleClick(event) {
    const screenPoint = inputProjector.screenPointFromEvent(event);
    const activationPolicy = inputProjector.resolveMountedActivationProjection(screenPoint);
    if (!activationPolicy.shouldTogglePin) {
      return;
    }
    if (!overlayInteractions.handleTogglePin({ screenPoint })) {
      return;
    }
    consumeOverlayEvent(event);
  }

  function handleClick(event) {
    const screenPoint = inputProjector.screenPointFromEvent(event);
    const activationPolicy = inputProjector.resolveMountedActivationProjection(screenPoint);
    if (!activationPolicy.shouldConsumeClick) {
      return;
    }
    consumeOverlayEvent(event);
  }

  function handleWheel(event) {
    const screenPoint = inputProjector.screenPointFromEvent(event);
    const wheelPolicy = inputProjector.resolveMountedWheelProjection(screenPoint, {
      wheel: createWheelInputFactFromEvent(event),
    });
    if (!wheelPolicy.shouldHandle) {
      return;
    }
    if (!overlayInteractions.handleWheel({
      deltaY: event.deltaY,
      wheelMode: wheelPolicy.wheelMode,
      screenPoint,
    })) {
      return;
    }
    if (wheelPolicy.shouldConsume) {
      consumeOverlayEvent(event);
    }
  }
}
