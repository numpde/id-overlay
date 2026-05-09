import { RUNTIME_ERROR_SOURCE } from "../../core/runtime-error.js";

export function createOverlayEventBoundary({
  clearPendingPointerSequence,
  syncGlobalPointerListeners,
  reportRuntimeError,
  isForwardedMapGestureEvent = () => false,
}) {
  return {
    run,
    isForwardedMapGestureEvent,
    consumeOverlayEvent,
  };

  function run(operation, event, fn) {
    try {
      return fn();
    } catch (error) {
      clearPendingPointerSequence();
      syncGlobalPointerListeners();
      consumeOverlayEvent(event);
      reportRuntimeError({
        source: RUNTIME_ERROR_SOURCE.OVERLAY,
        operation,
        error,
      });
      return undefined;
    }
  }
}

export function consumeOverlayEvent(event) {
  event?.preventDefault?.();
  event?.stopPropagation?.();
  event?.stopImmediatePropagation?.();
}
