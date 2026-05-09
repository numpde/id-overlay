import { createPlacementTransform } from "../core/transform.js";
import { isLivePageSnapshot } from "./page-adapter/page-snapshot.js";

export function createInitialPastePlacement({ image, pageObservation }) {
  if (!image) {
    return null;
  }
  const snapshot = pageObservation.getSnapshot();
  if (!isLivePageSnapshot(snapshot)) {
    return null;
  }
  return createPlacementTransform({
    image,
    centerMapLatLon: snapshot.mapView.center,
    scale: 1,
    rotationRad: 0,
    zoom: snapshot.mapView.zoom,
  });
}
