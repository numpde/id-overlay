import { FORWARDED_MAP_GESTURE_EVENT_FLAG } from "../page-adapter.js";
import {
  createPointerInputFactFromEvent,
  createWheelInputFactFromEvent,
} from "../input-event-facts.js";
import {
  selectIsRuntimeDragging,
  selectRuntimePointerScreenPx,
} from "../../core/machine/selectors.js";
import { RUNTIME_ERROR_SOURCE } from "../../core/runtime-error.js";
import { createOverlayInputHost } from "./input-host.js";
import { createOverlayInputProjector } from "./input-projector.js";
import {
  PENDING_POINTER_SEQUENCE_ADVANCE_KIND,
  createPendingPointerSequenceSession,
} from "./pending-pointer-sequence.js";

export function createOverlayInputRouter({
  pageProjection,
  overlayInteractions,
  getRuntimeState,
  getOverlayInputContext,
  getMountElement,
}) {
  // TODO(smell): This router still couples DOM gesture routing, event
  // consumption, interaction dispatch, and error recovery. Listener ownership,
  // input projection, and pending sequence state now live behind narrow seams.
  let isDestroyed = false;
  const pendingPointerSequence = createPendingPointerSequenceSession({
    onChange: syncGlobalPointerListeners,
  });
  const inputProjector = createOverlayInputProjector({
    pageProjection,
    getOverlayInputContext,
  });
  const inputHost = createOverlayInputHost({
    getMountElement,
    mountedHandlers: {
      handleMountedPointerMove,
      handleMountedPointerLeave,
      handleMountedPointerDown,
      handleMountedClick,
      handleMountedDoubleClick,
      handleMountedWheel,
    },
    globalPointerHandlers: {
      handleGlobalPointerMove,
      handleGlobalPointerUp,
      handleGlobalPointerCancel,
    },
  });

  return {
    syncMountedInputListeners,
    syncGlobalPointerListeners,

    destroy() {
      isDestroyed = true;
      pendingPointerSequence.clear();
      inputHost.destroy();
    },
  };

  function syncMountedInputListeners() {
    inputHost.syncMountedInputListeners();
  }

  function handleMountedPointerMove(event) {
    runOverlayBoundary("mounted-pointer-move", event, () => {
      if (isForwardedMapGestureEvent(event)) {
        return;
      }
      if (pendingPointerSequence.hasPending()) {
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
    });
  }

  function handleMountedPointerLeave() {
    runOverlayBoundary("mounted-pointer-leave", null, () => {
      if (selectIsRuntimeDragging(getRuntimeState())) {
        return;
      }
      overlayInteractions.handlePointerLeave();
    });
  }

  function handleMountedPointerDown(event) {
    runOverlayBoundary("mounted-pointer-down", event, () => {
      if (isForwardedMapGestureEvent(event)) {
        return;
      }
      const screenPoint = inputProjector.screenPointFromEvent(event);
      const pointerPolicy = inputProjector.resolveMountedInputProjection(screenPoint, {
        pointer: createPointerInputFactFromEvent(event),
      }).pointerSequence;
      if (!pointerPolicy.shouldOwnPointerSequence) {
        return;
      }
      pendingPointerSequence.begin({
        button: event.button,
        dragMode: pointerPolicy.dragMode,
        startScreenPoint: screenPoint,
      });
      consumeOverlayEvent(event);
    });
  }

  function handleMountedDoubleClick(event) {
    runOverlayBoundary("mounted-double-click", event, () => {
      if (isForwardedMapGestureEvent(event)) {
        return;
      }
      const screenPoint = inputProjector.screenPointFromEvent(event);
      const activationPolicy = inputProjector.resolveMountedInputProjection(screenPoint).activation;
      if (!activationPolicy.shouldTogglePin) {
        return;
      }
      if (!overlayInteractions.handleTogglePin({ screenPoint })) {
        return;
      }
      consumeOverlayEvent(event);
    });
  }

  function handleMountedClick(event) {
    runOverlayBoundary("mounted-click", event, () => {
      if (isForwardedMapGestureEvent(event)) {
        return;
      }
      const screenPoint = inputProjector.screenPointFromEvent(event);
      const activationPolicy = inputProjector.resolveMountedInputProjection(screenPoint).activation;
      if (!activationPolicy.shouldConsumeClick) {
        return;
      }
      consumeOverlayEvent(event);
    });
  }

  function handleMountedWheel(event) {
    runOverlayBoundary("mounted-wheel", event, () => {
      if (isForwardedMapGestureEvent(event)) {
        return;
      }
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
    });
  }

  function handleGlobalPointerMove(event) {
    runOverlayBoundary("global-pointer-move", event, () => {
      if (isForwardedMapGestureEvent(event)) {
        return;
      }
      const screenPoint = inputProjector.screenPointFromEvent(event);
      if (!advancePendingPointerSequence(event, screenPoint)) {
        return;
      }
      if (!selectIsRuntimeDragging(getRuntimeState())) {
        syncGlobalPointerListeners();
        return;
      }
      overlayInteractions.handlePointerMove(screenPoint);
      consumeOverlayEvent(event);
    });
  }

  function advancePendingPointerSequence(event, screenPoint) {
    const outcome = pendingPointerSequence.advance(screenPoint);
    switch (outcome.kind) {
      case PENDING_POINTER_SEQUENCE_ADVANCE_KIND.NO_PENDING_SEQUENCE:
        return true;
      case PENDING_POINTER_SEQUENCE_ADVANCE_KIND.STILL_PENDING:
        consumeOverlayEvent(event);
        return false;
      case PENDING_POINTER_SEQUENCE_ADVANCE_KIND.ACTIVATED:
        return handlePendingPointerSequenceActivation(event, outcome.sequence);
      default:
        return true;
    }
  }

  function handlePendingPointerSequenceActivation(event, pendingSequence) {
    overlayInteractions.handlePointerMove(pendingSequence.startScreenPoint);
    if (overlayInteractions.handlePointerDown({
      button: pendingSequence.button,
      screenPoint: pendingSequence.startScreenPoint,
      dragMode: pendingSequence.dragMode,
    })) {
      return true;
    }
    consumeOverlayEvent(event);
    return false;
  }

  function handleGlobalPointerUp(event) {
    runOverlayBoundary("global-pointer-up", event, () => {
      if (isForwardedMapGestureEvent(event)) {
        return;
      }
      if (pendingPointerSequence.hasPending()) {
        pendingPointerSequence.clear();
        consumeOverlayEvent(event);
        return;
      }
      if (!selectIsRuntimeDragging(getRuntimeState())) {
        syncGlobalPointerListeners();
        return;
      }
      overlayInteractions.handlePointerUp(inputProjector.screenPointFromEvent(event));
      consumeOverlayEvent(event);
    });
  }

  function handleGlobalPointerCancel(event) {
    runOverlayBoundary("global-pointer-cancel", event, () => {
      if (isForwardedMapGestureEvent(event)) {
        return;
      }
      pendingPointerSequence.clear();
      overlayInteractions.handlePointerCancel();
      consumeOverlayEvent(event);
    });
  }

  function runOverlayBoundary(operation, event, fn) {
    try {
      return fn();
    } catch (error) {
      pendingPointerSequence.clear();
      syncGlobalPointerListeners();
      consumeOverlayEvent(event);
      overlayInteractions.reportRuntimeError({
        source: RUNTIME_ERROR_SOURCE.OVERLAY,
        operation,
        error,
        resetInteraction: true,
      });
      return undefined;
    }
  }

  function syncGlobalPointerListeners() {
    if (isDestroyed) {
      return;
    }
    inputHost.syncGlobalPointerListeners(pendingPointerSequence.shouldListenGlobally({
      hasActiveGesture: selectIsRuntimeDragging(getRuntimeState()),
    }));
  }
}

function isForwardedMapGestureEvent(event) {
  return event?.[FORWARDED_MAP_GESTURE_EVENT_FLAG] === true;
}

function consumeOverlayEvent(event) {
  event?.preventDefault?.();
  event?.stopPropagation?.();
  event?.stopImmediatePropagation?.();
}
