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
    return errorBoundary.run("handle-pointer-move", () => {
      return gestureLifecycle.moveOrObservePointer(screenPoint);
    }, { fallbackValue: false });
  }

  function handlePointerDown({ button, screenPoint, dragMode }) {
    return errorBoundary.run("handle-pointer-down", () => {
      return gestureLifecycle.begin({ button, screenPoint, dragMode });
    }, { fallbackValue: false });
  }

  function handlePointerUp(screenPoint) {
    return errorBoundary.run("handle-pointer-up", () => {
      return gestureLifecycle.finish(screenPoint);
    }, { fallbackValue: false });
  }

  function handlePointerCancel() {
    return errorBoundary.run("handle-pointer-cancel", () => {
      gestureLifecycle.reset({
        endPointerScreenPx: runtimeBridge.getPointerScreenPx(),
        pointerScreenPx: null,
      });
      return true;
    });
  }
}
