import {
  selectIsRuntimeDragging,
} from "../../core/machine/selectors.js";

export function createPointerInteraction({
  adapterDrag,
  runtimeBridge,
  errorBoundary,
}) {
  return {
    handlePointerEnter,
    handlePointerLeave,
    handlePointerMove,
    handlePointerDown,
    handlePointerUp,
    handlePointerCancel,
  };

  function handlePointerEnter(screenPoint) {
    runtimeBridge.updatePointer(screenPoint);
  }

  function handlePointerLeave() {
    if (selectIsRuntimeDragging(runtimeBridge.getRuntimeState())) {
      return;
    }
    runtimeBridge.updatePointer(null);
  }

  function handlePointerMove(screenPoint) {
    return errorBoundary.run("handle-pointer-move", () => {
      const dragMode = adapterDrag.getActiveDragMode();
      if (selectIsRuntimeDragging(runtimeBridge.getRuntimeState()) && dragMode) {
        adapterDrag.move(screenPoint);
        runtimeBridge.beginGesture(screenPoint, {
          gestureKind: dragMode,
        });
        return true;
      }
      runtimeBridge.updatePointer(screenPoint);
      return true;
    }, { fallbackValue: false });
  }

  function handlePointerDown({ button, screenPoint, dragMode }) {
    return errorBoundary.run("handle-pointer-down", () => {
      if (!adapterDrag.begin({ button, screenPoint, dragMode })) {
        return false;
      }
      runtimeBridge.beginGesture(screenPoint, {
        gestureKind: dragMode,
      });
      return true;
    }, { fallbackValue: false });
  }

  function handlePointerUp(screenPoint) {
    return errorBoundary.run("handle-pointer-up", () => {
      if (!adapterDrag.end(screenPoint)) {
        return false;
      }
      runtimeBridge.endGesture(screenPoint);
      return true;
    }, { fallbackValue: false });
  }

  function handlePointerCancel() {
    return errorBoundary.run("handle-pointer-cancel", () => {
      runtimeBridge.reset({
        endPointerScreenPx: runtimeBridge.getPointerScreenPx(),
        pointerScreenPx: null,
      });
      return true;
    });
  }
}
