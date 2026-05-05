import {
  selectIsRuntimeDragging,
} from "../../core/machine/selectors.js";

export function createPointerInteraction({
  adapterDrag,
  runtimeBridge,
  errorBoundary,
}) {
  // TODO(smell): Pointer interaction still coordinates adapter drag side effects
  // with runtime mutation commands. The final boundary should report pointer
  // lifecycle facts once, letting the machine derive runtime state and overlay
  // edit semantics from the same ingress event.
  return {
    handlePointerEnter,
    handlePointerLeave,
    handlePointerMove,
    handlePointerDown,
    handlePointerUp,
    handlePointerCancel,
  };

  function handlePointerEnter(screenPoint) {
    runtimeBridge.observePointer(screenPoint);
  }

  function handlePointerLeave() {
    if (selectIsRuntimeDragging(runtimeBridge.getRuntimeState())) {
      return;
    }
    runtimeBridge.clearPointer();
  }

  function handlePointerMove(screenPoint) {
    return errorBoundary.run("handle-pointer-move", () => {
      const dragMode = adapterDrag.getActiveDragMode();
      if (selectIsRuntimeDragging(runtimeBridge.getRuntimeState()) && dragMode) {
        adapterDrag.move(screenPoint);
        runtimeBridge.observeGestureMove(screenPoint, {
          gestureKind: dragMode,
        });
        return true;
      }
      runtimeBridge.observePointer(screenPoint);
      return true;
    }, { fallbackValue: false });
  }

  function handlePointerDown({ button, screenPoint, dragMode }) {
    return errorBoundary.run("handle-pointer-down", () => {
      if (!adapterDrag.begin({ button, screenPoint, dragMode })) {
        return false;
      }
      runtimeBridge.observeGestureStart(screenPoint, {
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
      runtimeBridge.observeGestureFinish(screenPoint);
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
