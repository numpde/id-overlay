import {
  findViewportElement,
  isOverlayOwnedElement,
} from "./page-dom-queries.js";
import {
  dispatchForwardedMapPointerPhase,
  dispatchForwardedMapWheel,
  isForwardedMapGestureEvent,
} from "./forwarded-map-events.js";
import {
  screenPointToContextClientPoint,
} from "./projection.js";

export function createMapGestureForwarder({ getActiveMapContext }) {
  // TODO(smell): This coordinator still owns active pan lifecycle and DOM target
  // resolution. Extract target resolution first; only pan/zoom sequencing should
  // remain here.
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
    // TODO(smell): Projection and hit-target resolution are bundled into one
    // gesture context. The final adapter should pass explicit client-point and
    // target facts into the event dispatcher.
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
  // TODO(smell): Zoom targeting falls through three DOM heuristics. Quarantine
  // this as a map-target resolver before changing gesture behavior.
  const target = resolveUnderlyingMapTargetAtClientPoint(context.viewportDocument, clientPoint);
  return target ?? findViewportElement(context.viewportDocument) ?? context.viewportDocument.body;
}

function resolveMapPanTarget(context) {
  // TODO(smell): Pan targeting assumes the viewport element is the safest drag
  // sink. Keep this separate from pan lifecycle so target policy can be tested
  // against upstream iD DOM changes.
  return findViewportElement(context.viewportDocument)
    ?? context.viewportDocument.body
    ?? context.viewportDocument.documentElement
    ?? null;
}

function resolveUnderlyingMapTargetAtClientPoint(viewportDocument, clientPoint) {
  // TODO(smell): Underlay hit-testing depends on browser stacking order and the
  // extension-owned marker convention. This should be the only place that knows
  // how to skip overlay-owned elements.
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
