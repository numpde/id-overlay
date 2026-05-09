import {
  applySurfaceMotionToScreenPoint,
  removeSurfaceMotionFromScreenPoint,
} from "../../core/transform.js";
import {
  createSnapshotProjectionFacts,
  projectMapPointToBaseScreenPoint,
  unprojectBaseScreenPointToMap,
} from "./projection-facts.js";

export function createPageProjection({ getActiveMapContext, getSnapshot }) {
  function clientPointToScreen(clientPoint) {
    return contextClientPointToScreenPoint(clientPoint, getActiveMapContext());
  }

  function screenPointToClient(screenPoint) {
    return screenPointToContextClientPoint(screenPoint, getActiveMapContext());
  }

  function mapToScreen(point) {
    const snapshot = getSnapshot();
    return applySurfaceMotionToScreenPoint({
      screenPoint: projectMapPointToBaseScreenPoint({
        projectionFacts: createSnapshotProjectionFacts(snapshot),
        point,
      }),
      snapshot,
    });
  }

  function mapToOverlayLayerScreen(point) {
    return projectMapPointToBaseScreenPoint({
      projectionFacts: createSnapshotProjectionFacts(getSnapshot()),
      point,
    });
  }

  function screenToMap(screenPoint) {
    const snapshot = getSnapshot();
    const baseScreenPoint = removeSurfaceMotionFromScreenPoint({
      screenPoint,
      snapshot,
    });
    return unprojectBaseScreenPointToMap({
      projectionFacts: createSnapshotProjectionFacts(snapshot),
      screenPoint: baseScreenPoint,
    });
  }

  return {
    clientPointToScreen,
    screenPointToClient,
    mapToScreen,
    mapToOverlayLayerScreen,
    screenToMap,
  };
}

export function screenPointToContextClientPoint(screenPoint, context) {
  if (!context.frameElement) {
    return {
      x: screenPoint.x,
      y: screenPoint.y,
    };
  }
  const frameRect = context.frameElement.getBoundingClientRect();
  return {
    x: screenPoint.x - frameRect.left,
    y: screenPoint.y - frameRect.top,
  };
}

function contextClientPointToScreenPoint(clientPoint, context) {
  if (!context.frameElement) {
    return {
      x: clientPoint.x,
      y: clientPoint.y,
    };
  }

  const frameRect = context.frameElement.getBoundingClientRect();
  return {
    x: frameRect.left + clientPoint.x,
    y: frameRect.top + clientPoint.y,
  };
}
