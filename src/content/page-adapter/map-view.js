import {
  getSafeLocation,
  isSurfaceMotionActive,
} from "./dom.js";
import {
  DEFAULT_MAP_VIEW,
  deriveTileMapView,
  parseHashMapView,
} from "./map-view-facts.js";

export { DEFAULT_MAP_VIEW } from "./map-view-facts.js";

export function createMapViewResolver() {
  // TODO(smell): Map-view inference is currently tile/hash derived, not sourced
  // from a canonical iD map API. Keep this resolver isolated from projection callers.
  let lastCoherentMapView = null;

  function resolveMapView(context, { viewportRect, surfaceMotion }) {
    // TODO(smell): This precedence order encodes confidence policy: rendered
    // tile facts beat stale live-motion cache, which beats URL hash fallback.
    // Final shape should return provenance/confidence with the map view.
    const preciseMapView = deriveTileMapView({
      viewportDocument: context.viewportDocument,
      viewportRect,
    });
    if (preciseMapView) {
      lastCoherentMapView = preciseMapView;
      return preciseMapView;
    }
    if (isSurfaceMotionActive(surfaceMotion) && lastCoherentMapView) {
      return lastCoherentMapView;
    }
    const hashMapView = parseHashMapView(getSafeLocation(context.mapWindow).hash);
    lastCoherentMapView = hashMapView;
    return hashMapView;
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
