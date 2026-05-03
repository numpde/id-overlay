import {
  applySurfaceMotionToScreenPoint,
  getViewportCenter,
  removeSurfaceMotionFromScreenPoint,
} from "../../core/transform.js";
import {
  projectLatLonToWorld,
  unprojectWorldToLatLon,
} from "../../core/geometry.js";

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
      screenPoint: projectMapPointToBaseScreenPoint({ snapshot, point }),
      snapshot,
    });
  }

  function mapToOverlayLayerScreen(point) {
    return projectMapPointToBaseScreenPoint({
      snapshot: getSnapshot(),
      point,
    });
  }

  function screenToMap(screenPoint) {
    const snapshot = getSnapshot();
    const projection = createProjectionContext(snapshot);
    const baseScreenPoint = removeSurfaceMotionFromScreenPoint({
      screenPoint,
      snapshot,
    });
    const zoomScale = 2 ** projection.mapView.zoom;

    return unprojectWorldToLatLon({
      x: projection.centerWorld.x + (baseScreenPoint.x - projection.viewportCenter.x) / zoomScale,
      y: projection.centerWorld.y + (baseScreenPoint.y - projection.viewportCenter.y) / zoomScale,
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

function projectMapPointToBaseScreenPoint({ snapshot, point }) {
  const projection = createProjectionContext(snapshot);
  const pointWorld = projectLatLonToWorld(point);
  const zoomScale = 2 ** projection.mapView.zoom;
  return {
    x: projection.viewportCenter.x + (pointWorld.x - projection.centerWorld.x) * zoomScale,
    y: projection.viewportCenter.y + (pointWorld.y - projection.centerWorld.y) * zoomScale,
  };
}

function createProjectionContext(snapshot) {
  return {
    viewportRect: snapshot.viewportRect,
    mapView: snapshot.mapView,
    viewportCenter: getViewportCenter(snapshot.viewportRect),
    centerWorld: projectLatLonToWorld(snapshot.mapView.center),
  };
}
