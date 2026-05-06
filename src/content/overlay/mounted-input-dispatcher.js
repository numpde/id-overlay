import {
  createPointerInputFactFromEvent,
  createWheelInputFactFromEvent,
} from "../input-event-facts.js";
import {
  selectIsRuntimeDragging,
  selectRuntimePointerScreenPx,
} from "../../core/machine/selectors.js";

export function createOverlayMountedInputDispatcher({
  overlayInteractions,
  inputProjector,
  getRuntimeState,
  pointerSequenceRouter,
  consumeOverlayEvent,
}) {
  // TODO(smell): Mounted input dispatch still reads runtime dragging state and
  // branches per DOM event. The ideal overlay input host would translate DOM
  // events into normalized facts, then dispatch a single projected interaction
  // intent without duplicating runtime predicates here.
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
    const runtime = getRuntimeState();
    const screenPoint = inputProjector.screenPointFromEvent(event);
    if (selectIsRuntimeDragging(runtime)) {
      overlayInteractions.handlePointerMove(screenPoint);
      consumeOverlayEvent(event);
      return;
    }
    const pointerPolicy = inputProjector.resolveMountedPointerMoveProjection(screenPoint, {
      pointer: createPointerInputFactFromEvent(event),
    });
    if (pointerPolicy.shouldTrackPointer) {
      overlayInteractions.handlePointerMove(screenPoint);
      return;
    }
    if (selectRuntimePointerScreenPx(runtime)) {
      overlayInteractions.handlePointerLeave();
    }
  }

  function handlePointerLeave() {
    if (selectIsRuntimeDragging(getRuntimeState())) {
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
