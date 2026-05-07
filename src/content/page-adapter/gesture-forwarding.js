import {
  findViewportElement,
  isOverlayOwnedElement,
} from "./page-dom-queries.js";
import {
  screenPointToContextClientPoint,
} from "./projection.js";

export const FORWARDED_MAP_GESTURE_EVENT_FLAG = "idOverlayForwardedMapGesture";

export function isForwardedMapGestureEvent(event) {
  return event?.[FORWARDED_MAP_GESTURE_EVENT_FLAG] === true;
}

export function createMapGestureForwarder({ getActiveMapContext }) {
  // TODO(smell): Gesture forwarding relies on synthetic DOM events matching iD's
  // native handlers closely enough. Keep it quarantined here and cover browser
  // compatibility before widening supported gestures.
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
    const gestureContext = resolveForwardedMapGestureContext({
      screenPoint,
      targetResolver: resolveMapZoomTarget,
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
    return resolveForwardedMapGestureContext({
      screenPoint,
      targetResolver: resolveMapPanTarget,
    });
  }

  function resolveActiveMapPanGesture(screenPoint) {
    if (!activeMapPan) {
      return null;
    }
    return resolveForwardedMapGestureContext({
      screenPoint,
      context: activeMapPan.context,
      target: activeMapPan.context.viewportDocument,
    });
  }

  function resolveForwardedMapGestureContext({
    screenPoint,
    context = getActiveMapContext(),
    target = null,
    targetResolver = null,
  }) {
    const clientPoint = screenPointToContextClientPoint(screenPoint, context);
    const resolvedTarget = target ?? targetResolver?.(context, clientPoint) ?? null;
    if (!resolvedTarget) {
      return null;
    }
    return {
      context,
      clientPoint,
      target: resolvedTarget,
    };
  }

  return {
    beginMapPan,
    updateMapPan,
    endMapPan,
    forwardMapZoom,
    isForwardedMapGestureEvent,
  };
}

function resolveMapZoomTarget(context, clientPoint) {
  const target = resolveUnderlyingMapTargetAtClientPoint(context.viewportDocument, clientPoint);
  return target ?? findViewportElement(context.viewportDocument) ?? context.viewportDocument.body;
}

function resolveMapPanTarget(context) {
  return findViewportElement(context.viewportDocument)
    ?? context.viewportDocument.body
    ?? context.viewportDocument.documentElement
    ?? null;
}

function resolveUnderlyingMapTargetAtClientPoint(viewportDocument, clientPoint) {
  const elementsAtPoint = viewportDocument.elementsFromPoint?.(clientPoint.x, clientPoint.y);
  if (Array.isArray(elementsAtPoint) && elementsAtPoint.length) {
    const nonOverlayTarget = elementsAtPoint.find((element) => !isOverlayOwnedElement(element));
    if (nonOverlayTarget) {
      return nonOverlayTarget;
    }
  }

  const target = viewportDocument.elementFromPoint?.(clientPoint.x, clientPoint.y);
  if (target && !isOverlayOwnedElement(target)) {
    return target;
  }

  return null;
}

function dispatchForwardedMapPointerPhase({ context, target, type, clientPoint }) {
  const eventInit = {
    bubbles: true,
    cancelable: true,
    clientX: clientPoint.x,
    clientY: clientPoint.y,
    screenX: clientPoint.x,
    screenY: clientPoint.y,
    button: 0,
    buttons: type === "up" ? 0 : 1,
    view: context.mapWindow,
  };

  if (typeof context.mapWindow.PointerEvent === "function") {
    const pointerType = type === "down" ? "pointerdown" : type === "move" ? "pointermove" : "pointerup";
    const pointerEvent = new context.mapWindow.PointerEvent(pointerType, {
      ...eventInit,
      pointerId: 1,
      pointerType: "mouse",
      isPrimary: true,
    });
    dispatchForwardedMapEvent(pointerEvent, target);
  }

  const mouseType = type === "down" ? "mousedown" : type === "move" ? "mousemove" : "mouseup";
  const mouseEvent = new context.mapWindow.MouseEvent(mouseType, eventInit);
  dispatchForwardedMapEvent(mouseEvent, target);
}

function dispatchForwardedMapWheel({
  context,
  target,
  clientPoint,
  deltaX = 0,
  deltaY = 0,
  deltaMode = 0,
}) {
  const event = new context.mapWindow.WheelEvent("wheel", {
    bubbles: true,
    cancelable: true,
    clientX: clientPoint.x,
    clientY: clientPoint.y,
    screenX: clientPoint.x,
    screenY: clientPoint.y,
    deltaX,
    deltaY,
    deltaMode,
    view: context.mapWindow,
  });
  dispatchForwardedMapEvent(event, target);
}

function dispatchForwardedMapEvent(event, target) {
  markForwardedMapGestureEvent(event);
  target.dispatchEvent(event);
}

function markForwardedMapGestureEvent(event) {
  Object.defineProperty(event, FORWARDED_MAP_GESTURE_EVENT_FLAG, {
    configurable: true,
    enumerable: false,
    value: true,
  });
}
