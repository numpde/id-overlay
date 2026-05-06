import {
  createPointerInputFactFromEvent,
  createWheelInputFactFromEvent,
} from "../input-event-facts.js";
import {
  selectIsRuntimeDragging,
  selectRuntimePointerScreenPx,
} from "../../core/machine/selectors.js";
import { createOverlayEventBoundary } from "./event-boundary.js";
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
  const eventBoundary = createOverlayEventBoundary({
    clearPendingPointerSequence: pendingPointerSequence.clear,
    syncGlobalPointerListeners,
    reportRuntimeError: overlayInteractions.reportRuntimeError,
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
    eventBoundary.run("mounted-pointer-move", event, () => {
      if (eventBoundary.isForwardedMapGestureEvent(event)) {
        return;
      }
      if (pendingPointerSequence.hasPending()) {
        return;
      }
      const runtime = getRuntimeState();
      const screenPoint = inputProjector.screenPointFromEvent(event);
      if (selectIsRuntimeDragging(runtime)) {
        overlayInteractions.handlePointerMove(screenPoint);
        eventBoundary.consumeOverlayEvent(event);
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
    eventBoundary.run("mounted-pointer-leave", null, () => {
      if (selectIsRuntimeDragging(getRuntimeState())) {
        return;
      }
      overlayInteractions.handlePointerLeave();
    });
  }

  function handleMountedPointerDown(event) {
    eventBoundary.run("mounted-pointer-down", event, () => {
      if (eventBoundary.isForwardedMapGestureEvent(event)) {
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
      eventBoundary.consumeOverlayEvent(event);
    });
  }

  function handleMountedDoubleClick(event) {
    eventBoundary.run("mounted-double-click", event, () => {
      if (eventBoundary.isForwardedMapGestureEvent(event)) {
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
      eventBoundary.consumeOverlayEvent(event);
    });
  }

  function handleMountedClick(event) {
    eventBoundary.run("mounted-click", event, () => {
      if (eventBoundary.isForwardedMapGestureEvent(event)) {
        return;
      }
      const screenPoint = inputProjector.screenPointFromEvent(event);
      const activationPolicy = inputProjector.resolveMountedInputProjection(screenPoint).activation;
      if (!activationPolicy.shouldConsumeClick) {
        return;
      }
      eventBoundary.consumeOverlayEvent(event);
    });
  }

  function handleMountedWheel(event) {
    eventBoundary.run("mounted-wheel", event, () => {
      if (eventBoundary.isForwardedMapGestureEvent(event)) {
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
        eventBoundary.consumeOverlayEvent(event);
      }
    });
  }

  function handleGlobalPointerMove(event) {
    eventBoundary.run("global-pointer-move", event, () => {
      if (eventBoundary.isForwardedMapGestureEvent(event)) {
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
      eventBoundary.consumeOverlayEvent(event);
    });
  }

  function advancePendingPointerSequence(event, screenPoint) {
    const outcome = pendingPointerSequence.advance(screenPoint);
    switch (outcome.kind) {
      case PENDING_POINTER_SEQUENCE_ADVANCE_KIND.NO_PENDING_SEQUENCE:
        return true;
      case PENDING_POINTER_SEQUENCE_ADVANCE_KIND.STILL_PENDING:
        eventBoundary.consumeOverlayEvent(event);
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
    eventBoundary.consumeOverlayEvent(event);
    return false;
  }

  function handleGlobalPointerUp(event) {
    eventBoundary.run("global-pointer-up", event, () => {
      if (eventBoundary.isForwardedMapGestureEvent(event)) {
        return;
      }
      if (pendingPointerSequence.hasPending()) {
        pendingPointerSequence.clear();
        eventBoundary.consumeOverlayEvent(event);
        return;
      }
      if (!selectIsRuntimeDragging(getRuntimeState())) {
        syncGlobalPointerListeners();
        return;
      }
      overlayInteractions.handlePointerUp(inputProjector.screenPointFromEvent(event));
      eventBoundary.consumeOverlayEvent(event);
    });
  }

  function handleGlobalPointerCancel(event) {
    eventBoundary.run("global-pointer-cancel", event, () => {
      if (eventBoundary.isForwardedMapGestureEvent(event)) {
        return;
      }
      pendingPointerSequence.clear();
      overlayInteractions.handlePointerCancel();
      eventBoundary.consumeOverlayEvent(event);
    });
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
