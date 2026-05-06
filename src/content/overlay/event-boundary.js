import { RUNTIME_ERROR_SOURCE } from "../../core/runtime-error.js";
import { FORWARDED_MAP_GESTURE_EVENT_FLAG } from "../page-adapter.js";

// TODO(smell): Overlay event recovery imports the forwarded-map marker through
// the page-adapter facade. The final event boundary should receive this as an
// injected page/gesture fact helper so overlay does not know page-adapter shape.
export function createOverlayEventBoundary({
  clearPendingPointerSequence,
  syncGlobalPointerListeners,
  reportRuntimeError,
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
        resetInteraction: true,
      });
      return undefined;
    }
  }
}

export function isForwardedMapGestureEvent(event) {
  return event?.[FORWARDED_MAP_GESTURE_EVENT_FLAG] === true;
}

export function consumeOverlayEvent(event) {
  event?.preventDefault?.();
  event?.stopPropagation?.();
  event?.stopImmediatePropagation?.();
}
