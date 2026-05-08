import {
  resolveMapPanTarget,
  resolveMapZoomTarget,
} from "./upstream-gesture-targets.js";
import {
  screenPointToContextClientPoint,
} from "./projection.js";

export function resolveMapPanGestureFacts({
  context,
  screenPoint,
}) {
  return resolveForwardedMapGestureFacts({
    context,
    screenPoint,
    targetResolver: resolveMapPanTarget,
  });
}

export function resolveMapZoomGestureFacts({
  context,
  screenPoint,
}) {
  return resolveForwardedMapGestureFacts({
    context,
    screenPoint,
    targetResolver: resolveMapZoomTarget,
  });
}

export function resolveMapPanContinuationGestureFacts({
  context,
  screenPoint,
}) {
  return resolveForwardedMapGestureFacts({
    context,
    screenPoint,
    target: context.viewportDocument,
  });
}

function resolveForwardedMapGestureFacts({
  context,
  screenPoint,
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
