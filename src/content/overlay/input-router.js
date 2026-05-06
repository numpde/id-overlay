import { createOverlayEventBoundary } from "./event-boundary.js";
import {
  createOverlayGlobalPointerDispatcher,
} from "./global-pointer-dispatcher.js";
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
  isForwardedMapGestureEvent,
}) {
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
    isForwardedMapGestureEvent,
  });
  const inputProjector = createOverlayInputProjector({
    pageProjection,
    getOverlayInputContext,
  });
  const mountedInputDispatcher = createOverlayMountedInputDispatcher({
    overlayInteractions,
    inputProjector,
    pointerSequenceRouter,
    consumeOverlayEvent: (event) => eventBoundary.consumeOverlayEvent(event),
  });
  const globalPointerDispatcher = createOverlayGlobalPointerDispatcher({
    overlayInteractions,
    inputProjector,
    getRuntimeState,
    pointerSequenceRouter,
    consumeOverlayEvent: (event) => eventBoundary.consumeOverlayEvent(event),
    syncGlobalPointerListeners,
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
    routeOverlayInput("mounted-pointer-move", event, mountedInputDispatcher.handlePointerMove);
  }

  function handleMountedPointerLeave() {
    routeOverlayInput("mounted-pointer-leave", null, mountedInputDispatcher.handlePointerLeave, {
      skipForwardedMapGesture: false,
    });
  }

  function handleMountedPointerDown(event) {
    routeOverlayInput("mounted-pointer-down", event, mountedInputDispatcher.handlePointerDown);
  }

  function handleMountedDoubleClick(event) {
    routeOverlayInput("mounted-double-click", event, mountedInputDispatcher.handleDoubleClick);
  }

  function handleMountedClick(event) {
    routeOverlayInput("mounted-click", event, mountedInputDispatcher.handleClick);
  }

  function handleMountedWheel(event) {
    routeOverlayInput("mounted-wheel", event, mountedInputDispatcher.handleWheel);
  }

  function handleGlobalPointerMove(event) {
    routeOverlayInput("global-pointer-move", event, globalPointerDispatcher.handlePointerMove);
  }

  function handleGlobalPointerUp(event) {
    routeOverlayInput("global-pointer-up", event, globalPointerDispatcher.handlePointerUp);
  }

  function handleGlobalPointerCancel(event) {
    routeOverlayInput("global-pointer-cancel", event, globalPointerDispatcher.handlePointerCancel);
  }

  function syncGlobalPointerListeners() {
    if (isDestroyed) {
      return;
    }
    inputHost.syncGlobalPointerListeners(globalPointerDispatcher.shouldListenGlobally());
  }

  function routeOverlayInput(
    operation,
    event,
    dispatch,
    { skipForwardedMapGesture = true } = {},
  ) {
    eventBoundary.run(operation, event, () => {
      if (skipForwardedMapGesture && eventBoundary.isForwardedMapGestureEvent(event)) {
        return;
      }
      dispatch(event);
    });
  }
}
