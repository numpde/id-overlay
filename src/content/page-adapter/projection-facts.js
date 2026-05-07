import {
  projectLatLonToWorld,
  unprojectWorldToLatLon,
} from "../../core/geometry.js";
import { getViewportCenter } from "../../core/transform.js";

export function createSnapshotProjectionFacts(snapshot) {
  return createMapProjectionFacts({
    viewportRect: snapshot.viewportRect,
    mapView: snapshot.mapView,
  });
}

export function createMapProjectionFacts({ viewportRect, mapView }) {
  return {
    viewportRect,
    mapView,
    viewportCenter: getViewportCenter(viewportRect),
    centerWorld: projectLatLonToWorld(mapView.center),
  };
}

export function projectMapPointToBaseScreenPoint({ projectionFacts, point }) {
  const pointWorld = projectLatLonToWorld(point);
  const zoomScale = getZoomScale(projectionFacts);
  return {
    x: projectionFacts.viewportCenter.x
      + (pointWorld.x - projectionFacts.centerWorld.x) * zoomScale,
    y: projectionFacts.viewportCenter.y
      + (pointWorld.y - projectionFacts.centerWorld.y) * zoomScale,
  };
}

export function unprojectBaseScreenPointToMap({ projectionFacts, screenPoint }) {
  const zoomScale = getZoomScale(projectionFacts);
  return unprojectWorldToLatLon({
    x: projectionFacts.centerWorld.x
      + (screenPoint.x - projectionFacts.viewportCenter.x) / zoomScale,
    y: projectionFacts.centerWorld.y
      + (screenPoint.y - projectionFacts.viewportCenter.y) / zoomScale,
  });
}

function getZoomScale(projectionFacts) {
  return 2 ** projectionFacts.mapView.zoom;
}
