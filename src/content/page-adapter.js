import { createLogger } from "../core/logger.js";
import { createBoundedMapGesturePort } from "./page-adapter/bounded-map-gesture.js";
import { createBoundedPageProjection } from "./page-adapter/bounded-projection.js";
import { createPageAdapterBoundary } from "./page-adapter/boundary.js";
import {
  createMapGestureForwarder,
} from "./page-adapter/gesture-forwarding.js";
import { createMapViewResolver } from "./page-adapter/map-view.js";
import { createPageObservationGraph } from "./page-adapter/observation-graph.js";
import { createPageProjection } from "./page-adapter/projection.js";
import { createViewportGeometryResolver } from "./page-adapter/viewport-geometry.js";

export function createPageAdapter({
  hashTarget = globalThis.window,
  viewportDocument = globalThis.document,
} = {}) {
  // TODO(smell): This is now the page-port composition root, but it still
  // manually wraps every exposed method in the error boundary. A final port
  // factory should apply boundary policy declaratively per port.
  const logger = createLogger("page-adapter");
  const runBoundary = createPageAdapterBoundary({ logger });
  const viewportGeometry = createViewportGeometryResolver({ hashTarget });
  const mapViewResolver = createMapViewResolver();
  const observationGraph = createPageObservationGraph({
    hashTarget,
    viewportDocument,
    viewportGeometry,
    mapViewResolver,
    runBoundary,
  });
  const { pageContext, snapshotSource } = observationGraph;

  const projection = createPageProjection({
    getActiveMapContext: pageContext.getActiveMapContext,
    getSnapshot: snapshotSource.getSnapshot,
  });
  const pageProjection = createBoundedPageProjection({
    projection,
    getFallbackMapView: mapViewResolver.getFallbackMapView,
    runBoundary,
  });
  const gestureForwarder = createMapGestureForwarder({
    getActiveMapContext: pageContext.getActiveMapContext,
  });
  const mapGesture = createBoundedMapGesturePort({
    gestureForwarder,
    runBoundary,
  });

  const pageSession = {
    isSupported: pageContext.isSupported,
    destroy: observationGraph.destroy,
  };
  const pageObservation = {
    getSnapshot: snapshotSource.getSnapshot,
    subscribe: snapshotSource.subscribe,
  };
  return {
    pageSession,
    pageObservation,
    pageProjection,
    mapGesture,
  };
}
