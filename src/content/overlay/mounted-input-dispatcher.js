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
    const pointerPolicy = inputProjector.resolveMountedInputProjection(screenPoint, {
      pointer: createPointerInputFactFromEvent(event),
    }).pointerMove;
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
    const pointerPolicy = inputProjector.resolveMountedInputProjection(screenPoint, {
      pointer: createPointerInputFactFromEvent(event),
    }).pointerSequence;
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
    const activationPolicy = inputProjector.resolveMountedInputProjection(screenPoint).activation;
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
    const activationPolicy = inputProjector.resolveMountedInputProjection(screenPoint).activation;
    if (!activationPolicy.shouldConsumeClick) {
      return;
    }
    consumeOverlayEvent(event);
  }

  function handleWheel(event) {
    const screenPoint = inputProjector.screenPointFromEvent(event);
    const wheelPolicy = inputProjector.resolveMountedInputProjection(screenPoint, {
      wheel: createWheelInputFactFromEvent(event),
    }).wheel;
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
