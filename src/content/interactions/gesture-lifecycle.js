import {
  selectIsRuntimeDragging,
  selectRuntimePointerScreenPx,
} from "../../core/machine/selectors.js";

export function createGestureLifecycle({
  adapterDrag,
  runtimeBridge,
}) {
  return {
    begin,
    move,
    moveOrObservePointer,
    finish,
    reset,
    clearPointerIfIdle,
    handleRuntimeChange,
  };

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

  function moveOrObservePointer(screenPoint) {
    if (move(screenPoint)) {
      return true;
    }
    runtimeBridge.observePointer(screenPoint);
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

  function clearPointerIfIdle() {
    if (selectIsRuntimeDragging(runtimeBridge.getRuntimeState())) {
      return false;
    }
    runtimeBridge.clearPointer();
    return true;
  }

  function handleRuntimeChange({ previousRuntime, nextRuntime }) {
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
