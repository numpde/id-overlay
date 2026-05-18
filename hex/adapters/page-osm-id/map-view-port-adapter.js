export function createOpenStreetMapMapViewPort({
  ownerWindow,
  findEmbeddedEditorFrame = () => null,
  eventDebugLogger = null,
}) {
  return {
    setMapView(mapView) {
      const targetWindow = activeMapWindow({
        ownerWindow,
        findEmbeddedEditorFrame,
      });
      if (!targetWindow || !validMapView(mapView)) {
        eventDebugLogger?.log?.("map-view-port", "set-map-view-ignored", {
          reason: !targetWindow ? "missing-map-window" : "invalid-map-view",
          mapView,
        });
        return {
          kind: "ignored",
        };
      }
      const previousHash = targetWindow.location.hash ?? "";
      const nextHash = hashWithMapView(previousHash, mapView);
      targetWindow.location.hash = nextHash;
      eventDebugLogger?.log?.("map-view-port", "set-map-view", {
        previousHash,
        nextHash,
        mapView,
      });
      return {
        kind: "set",
        hash: nextHash,
      };
    },
  };
}

function activeMapWindow({
  ownerWindow,
  findEmbeddedEditorFrame,
}) {
  const embeddedFrame = findEmbeddedEditorFrame();
  if (embeddedFrame?.contentWindow) {
    return embeddedFrame.contentWindow;
  }
  return ownerWindow;
}

function validMapView(mapView) {
  return Number.isFinite(mapView?.zoom)
    && Number.isFinite(mapView?.centerLatLon?.lat)
    && Number.isFinite(mapView?.centerLatLon?.lon);
}

function hashWithMapView(previousHash, mapView) {
  const mapParam = `map=${formatZoom(mapView.zoom)}/${formatLatLon(mapView.centerLatLon.lat)}/${formatLatLon(mapView.centerLatLon.lon)}`;
  if (/(^|[#&])map=/u.test(previousHash)) {
    return previousHash.replace(/(^|[#&])map=[^&]*/u, (match, prefix) => `${prefix}${mapParam}`);
  }
  const prefix = previousHash && previousHash !== "#" ? `${previousHash}&` : "#";
  return `${prefix}${mapParam}`;
}

function formatZoom(value) {
  return trimFixed(value, 6);
}

function formatLatLon(value) {
  return trimFixed(value, 7);
}

function trimFixed(value, precision) {
  return value.toFixed(precision).replace(/\.?0+$/u, "");
}
