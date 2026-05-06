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
}) {
  // TODO(smell): Input routing repeats the same forwarded-event guard and error
  // boundary wrapper for each mounted/global DOM event. Replace this with a
  // declarative route table or normalized event fact pipeline so adding an input
  // path does not require hand-copying guard/recovery structure.
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
      globalPointerDispatcher.handlePointerMove(event);
    });
  }

  function handleGlobalPointerUp(event) {
    eventBoundary.run("global-pointer-up", event, () => {
      if (eventBoundary.isForwardedMapGestureEvent(event)) {
        return;
      }
      globalPointerDispatcher.handlePointerUp(event);
    });
  }

  function handleGlobalPointerCancel(event) {
    eventBoundary.run("global-pointer-cancel", event, () => {
      if (eventBoundary.isForwardedMapGestureEvent(event)) {
        return;
      }
      globalPointerDispatcher.handlePointerCancel(event);
    });
  }

  function syncGlobalPointerListeners() {
    if (isDestroyed) {
      return;
    }
    inputHost.syncGlobalPointerListeners(globalPointerDispatcher.shouldListenGlobally());
  }
}
