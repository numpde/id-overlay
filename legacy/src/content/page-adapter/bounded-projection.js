export function createBoundedPageProjection({
  projection,
  getFallbackMapView,
  runBoundary,
}) {
  return {
    clientPointToScreen(clientPoint) {
      return readProjection("client-point-to-screen", () => {
        return projection.clientPointToScreen(clientPoint);
      }, fallbackScreenPoint(clientPoint));
    },
    screenPointToClient(screenPoint) {
      return readProjection("screen-point-to-client", () => {
        return projection.screenPointToClient(screenPoint);
      }, fallbackScreenPoint(screenPoint));
    },
    mapToScreen(point) {
      return readProjection("map-to-screen", () => {
        return projection.mapToScreen(point);
      }, fallbackScreenPoint());
    },
    mapToOverlayLayerScreen(point) {
      return readProjection("map-to-overlay-layer-screen", () => {
        return projection.mapToOverlayLayerScreen(point);
      }, fallbackScreenPoint());
    },
    screenToMap(screenPoint) {
      return readProjection("screen-to-map", () => {
        return projection.screenToMap(screenPoint);
      }, () => getFallbackMapView().center);
    },
  };

  function readProjection(operation, read, fallback) {
    const result = runBoundary(operation, read);
    if (result.ok) {
      return result.value;
    }
    return typeof fallback === "function" ? fallback() : fallback;
  }
}

function fallbackScreenPoint(point = null) {
  return {
    x: point?.x ?? 0,
    y: point?.y ?? 0,
  };
}
