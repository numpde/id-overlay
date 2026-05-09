import {
  getSafeLocation,
  isSurfaceMotionActive,
} from "./dom.js";
import {
  DEFAULT_MAP_VIEW,
  deriveHashMapView,
  deriveTileMapView,
} from "./upstream-map-view.js";
import {
  PAGE_MAP_VIEW_PROVENANCE_KIND,
  createPageMapViewProvenance,
} from "./page-snapshot.js";

export { DEFAULT_MAP_VIEW } from "./upstream-map-view.js";

export function createMapViewResolver() {
  // TODO(smell): Map-view inference is currently tile/hash derived, not sourced
  // from a canonical iD map API. Keep this resolver isolated from projection callers.
  let lastCoherentMapView = null;

  function resolveMapView(context, { viewportRect, surfaceMotion }) {
    const preciseMapView = deriveTileMapView({
      viewportDocument: context.viewportDocument,
      viewportRect,
    });
    if (preciseMapView) {
      lastCoherentMapView = preciseMapView;
      return createMapViewResolution({
        mapView: preciseMapView,
        provenanceKind: PAGE_MAP_VIEW_PROVENANCE_KIND.PRECISE,
      });
    }
    if (isSurfaceMotionActive(surfaceMotion) && lastCoherentMapView) {
      return createMapViewResolution({
        mapView: lastCoherentMapView,
        provenanceKind: PAGE_MAP_VIEW_PROVENANCE_KIND.RETAINED,
      });
    }
    const hashMapView = deriveHashMapView(getSafeLocation(context.mapWindow).hash);
    if (hashMapView) {
      lastCoherentMapView = hashMapView;
      return createMapViewResolution({
        mapView: hashMapView,
        provenanceKind: PAGE_MAP_VIEW_PROVENANCE_KIND.HASH,
      });
    }
    lastCoherentMapView = null;
    return createMapViewResolution({
      mapView: DEFAULT_MAP_VIEW,
      provenanceKind: PAGE_MAP_VIEW_PROVENANCE_KIND.DEFAULT,
    });
  }

  function getFallbackMapView() {
    return lastCoherentMapView ?? DEFAULT_MAP_VIEW;
  }

  function reset() {
    lastCoherentMapView = null;
  }

  return {
    resolveMapView,
    getFallbackMapView,
    reset,
  };
}

function createMapViewResolution({ mapView, provenanceKind }) {
  return {
    mapView,
    mapViewProvenance: createPageMapViewProvenance(provenanceKind),
  };
}
