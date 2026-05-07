export function createBoundedPageProjection({
  projection,
  getFallbackMapView,
  runBoundary,
}) {
  return {
    clientPointToScreen(clientPoint) {
      return runBoundary("client-point-to-screen", () => {
        return projection.clientPointToScreen(clientPoint);
      }, fallbackScreenPoint(clientPoint));
    },
    screenPointToClient(screenPoint) {
      return runBoundary("screen-point-to-client", () => {
        return projection.screenPointToClient(screenPoint);
      }, fallbackScreenPoint(screenPoint));
    },
    mapToScreen(point) {
      return runBoundary("map-to-screen", () => {
        return projection.mapToScreen(point);
      }, fallbackScreenPoint());
    },
    mapToOverlayLayerScreen(point) {
      return runBoundary("map-to-overlay-layer-screen", () => {
        return projection.mapToOverlayLayerScreen(point);
      }, fallbackScreenPoint());
    },
    screenToMap(screenPoint) {
      return runBoundary("screen-to-map", () => {
        return projection.screenToMap(screenPoint);
      }, getFallbackMapView().center);
    },
  };
}

function fallbackScreenPoint(point = null) {
  return {
    x: point?.x ?? 0,
    y: point?.y ?? 0,
  };
}
