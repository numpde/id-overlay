export function createPointerInteraction({
  gestureLifecycle,
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
    runtimeBridge.observePointer(screenPoint);
  }

  function handlePointerLeave() {
    gestureLifecycle.clearPointerIfIdle();
  }

  function handlePointerMove(screenPoint) {
    return errorBoundary.runHandledInteraction("handle-pointer-move", () => {
      return gestureLifecycle.moveOrObservePointer(screenPoint);
    });
  }

  function handlePointerDown({ button, screenPoint, dragMode }) {
    return errorBoundary.runHandledInteraction("handle-pointer-down", () => {
      return gestureLifecycle.begin({ button, screenPoint, dragMode });
    });
  }

  function handlePointerUp(screenPoint) {
    return errorBoundary.runHandledInteraction("handle-pointer-up", () => {
      return gestureLifecycle.finish(screenPoint);
    });
  }

  function handlePointerCancel() {
    return errorBoundary.runHandledInteraction("handle-pointer-cancel", () => {
      gestureLifecycle.reset({
        endPointerScreenPx: runtimeBridge.getPointerScreenPx(),
        pointerScreenPx: null,
      });
      return true;
    });
  }
}
