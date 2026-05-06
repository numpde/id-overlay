import {
  selectIsRuntimeDragging,
  selectRuntimePointerScreenPx,
} from "../../core/machine/selectors.js";

export function createGestureLifecycle({
  adapterDrag,
  runtimeBridge,
}) {
  // TODO(smell): Gesture lifecycle subscribes to machine runtime to repair
  // adapter drag state after external transitions. The ideal boundary would
  // make runtime interruption a lifecycle input, not an observed side effect.
  let observedRuntime = runtimeBridge.getRuntimeState();
  const unsubscribeRuntime = runtimeBridge.subscribe((nextRuntime) => {
    const previousRuntime = observedRuntime;
    observedRuntime = nextRuntime;
    syncAdapterDragFromRuntimeChange(previousRuntime, nextRuntime);
  }, { emitCurrent: false });

  return {
    destroy,
    begin,
    move,
    finish,
    reset,
  };

  function destroy() {
    unsubscribeRuntime();
  }

  function begin({ button, screenPoint, dragMode }) {
    if (!adapterDrag.begin({ button, screenPoint, dragMode })) {
      return false;
    }
    runtimeBridge.observeGestureStart(screenPoint, {
      gestureKind: dragMode,
    });
    return true;
  }

  function move(screenPoint) {
    const dragMode = adapterDrag.getActiveDragMode();
    if (!selectIsRuntimeDragging(runtimeBridge.getRuntimeState()) || !dragMode) {
      return false;
    }
    adapterDrag.move(screenPoint);
    runtimeBridge.observeGestureMove(screenPoint, {
      gestureKind: dragMode,
    });
    return true;
  }

  function finish(screenPoint) {
    if (!adapterDrag.hasActive()) {
      return false;
    }
    if (!adapterDrag.end(screenPoint)) {
      return false;
    }
    runtimeBridge.observeGestureFinish(screenPoint);
    return true;
  }

  function reset({
    endPointerScreenPx = runtimeBridge.getPointerScreenPx(),
    pointerScreenPx = runtimeBridge.getPointerScreenPx(),
    commitPlacement = true,
  } = {}) {
    adapterDrag.cancel(endPointerScreenPx, { commitPlacement });
    runtimeBridge.observeInputInterrupted({ pointerScreenPx });
  }

  function syncAdapterDragFromRuntimeChange(previousRuntime, nextRuntime) {
    if (
      !adapterDrag.hasActive() ||
      !selectIsRuntimeDragging(previousRuntime) ||
      selectIsRuntimeDragging(nextRuntime)
    ) {
      return;
    }
    adapterDrag.cancel(selectRuntimePointerScreenPx(previousRuntime), {
      commitPlacement: false,
    });
  }
}
