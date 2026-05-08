import {
  dispatchForwardedMapPointerPhase,
  dispatchForwardedMapWheel,
  isForwardedMapGestureEvent,
} from "./forwarded-map-events.js";
import {
  resolveMapPanContinuationGestureFacts,
  resolveMapPanGestureFacts,
  resolveMapZoomGestureFacts,
} from "./map-gesture-facts.js";

export function createMapGestureForwarder({ getActiveMapContext }) {
  let activeMapPan = null;

  function beginMapPan(screenPoint) {
    const mapPanSession = resolveMapPanSession(screenPoint);
    if (!mapPanSession) {
      activeMapPan = null;
      return false;
    }

    activeMapPan = mapPanSession;
    dispatchForwardedMapPointerPhase({
      context: mapPanSession.context,
      target: mapPanSession.target,
      type: "down",
      clientPoint: mapPanSession.clientPoint,
    });
    return true;
  }

  function updateMapPan(screenPoint) {
    const gestureContext = resolveActiveMapPanGesture(screenPoint);
    if (!gestureContext) {
      return false;
    }

    dispatchForwardedMapPointerPhase({
      context: gestureContext.context,
      target: gestureContext.target,
      type: "move",
      clientPoint: gestureContext.clientPoint,
    });
    return true;
  }

  function endMapPan(screenPoint) {
    const gestureContext = resolveActiveMapPanGesture(screenPoint);
    if (!gestureContext) {
      activeMapPan = null;
      return;
    }

    dispatchForwardedMapPointerPhase({
      context: gestureContext.context,
      target: gestureContext.target,
      type: "up",
      clientPoint: gestureContext.clientPoint,
    });
    activeMapPan = null;
  }

  function forwardMapZoom({ screenPoint, deltaX = 0, deltaY = 0, deltaMode = 0 }) {
    const gestureContext = resolveMapZoomGestureFacts({
      screenPoint,
      context: getActiveMapContext(),
    });
    if (!gestureContext || typeof gestureContext.context.mapWindow.WheelEvent !== "function") {
      return false;
    }

    dispatchForwardedMapWheel({
      context: gestureContext.context,
      target: gestureContext.target,
      clientPoint: gestureContext.clientPoint,
      deltaX,
      deltaY,
      deltaMode,
    });
    return true;
  }

  function resolveMapPanSession(screenPoint) {
    return resolveMapPanGestureFacts({
      screenPoint,
      context: getActiveMapContext(),
    });
  }

  function resolveActiveMapPanGesture(screenPoint) {
    if (!activeMapPan) {
      return null;
    }
    return resolveMapPanContinuationGestureFacts({
      screenPoint,
      context: activeMapPan.context,
    });
  }

  return {
    beginMapPan,
    updateMapPan,
    endMapPan,
    forwardMapZoom,
    isForwardedMapGestureEvent,
  };
}
