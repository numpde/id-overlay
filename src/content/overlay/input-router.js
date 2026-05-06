import {
  selectIsRuntimeDragging,
} from "../../core/machine/selectors.js";
import { createOverlayEventBoundary } from "./event-boundary.js";
import { createOverlayInputHost } from "./input-host.js";
import { createOverlayInputProjector } from "./input-projector.js";
import {
  createOverlayMountedInputDispatcher,
} from "./mounted-input-dispatcher.js";
import {
  createOverlayPointerSequenceRouter,
} from "./pointer-sequence-router.js";

export function createOverlayInputRouter({
  pageProjection,
  overlayInteractions,
  getRuntimeState,
  getOverlayInputContext,
  getMountElement,
}) {
  // TODO(smell): This router still owns global pointer gesture dispatch beside
  // listener wiring. Mounted policy dispatch, event recovery, input projection,
  // and pending sequence state now live behind narrow seams.
  let isDestroyed = false;
  const pointerSequenceRouter = createOverlayPointerSequenceRouter({
    onChange: syncGlobalPointerListeners,
    overlayInteractions,
    consumeOverlayEvent: (event) => eventBoundary.consumeOverlayEvent(event),
  });
  const eventBoundary = createOverlayEventBoundary({
    clearPendingPointerSequence: pointerSequenceRouter.clear,
    syncGlobalPointerListeners,
    reportRuntimeError: overlayInteractions.reportRuntimeError,
  });
  const inputProjector = createOverlayInputProjector({
    pageProjection,
    getOverlayInputContext,
  });
  const mountedInputDispatcher = createOverlayMountedInputDispatcher({
    overlayInteractions,
    inputProjector,
    getRuntimeState,
    pointerSequenceRouter,
    consumeOverlayEvent: (event) => eventBoundary.consumeOverlayEvent(event),
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
      pointerSequenceRouter.clear();
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
      mountedInputDispatcher.handlePointerMove(event);
    });
  }

  function handleMountedPointerLeave() {
    eventBoundary.run("mounted-pointer-leave", null, () => {
      mountedInputDispatcher.handlePointerLeave();
    });
  }

  function handleMountedPointerDown(event) {
    eventBoundary.run("mounted-pointer-down", event, () => {
      if (eventBoundary.isForwardedMapGestureEvent(event)) {
        return;
      }
      mountedInputDispatcher.handlePointerDown(event);
    });
  }

  function handleMountedDoubleClick(event) {
    eventBoundary.run("mounted-double-click", event, () => {
      if (eventBoundary.isForwardedMapGestureEvent(event)) {
        return;
      }
      mountedInputDispatcher.handleDoubleClick(event);
    });
  }

  function handleMountedClick(event) {
    eventBoundary.run("mounted-click", event, () => {
      if (eventBoundary.isForwardedMapGestureEvent(event)) {
        return;
      }
      mountedInputDispatcher.handleClick(event);
    });
  }

  function handleMountedWheel(event) {
    eventBoundary.run("mounted-wheel", event, () => {
      if (eventBoundary.isForwardedMapGestureEvent(event)) {
        return;
      }
      mountedInputDispatcher.handleWheel(event);
    });
  }

  function handleGlobalPointerMove(event) {
    eventBoundary.run("global-pointer-move", event, () => {
      if (eventBoundary.isForwardedMapGestureEvent(event)) {
        return;
      }
      const screenPoint = inputProjector.screenPointFromEvent(event);
      if (!pointerSequenceRouter.advanceGlobalPointerMove({ event, screenPoint })) {
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

  function handleGlobalPointerUp(event) {
    eventBoundary.run("global-pointer-up", event, () => {
      if (eventBoundary.isForwardedMapGestureEvent(event)) {
        return;
      }
      if (pointerSequenceRouter.consumePendingPointerUp(event)) {
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
      pointerSequenceRouter.clear();
      overlayInteractions.handlePointerCancel();
      eventBoundary.consumeOverlayEvent(event);
    });
  }

  function syncGlobalPointerListeners() {
    if (isDestroyed) {
      return;
    }
    inputHost.syncGlobalPointerListeners(pointerSequenceRouter.shouldListenGlobally({
      hasActiveGesture: selectIsRuntimeDragging(getRuntimeState()),
    }));
  }
}
