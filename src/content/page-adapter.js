import { createLogger } from "../core/logger.js";
import { createBoundedPageProjection } from "./page-adapter/bounded-projection.js";
import { createPageAdapterBoundary } from "./page-adapter/boundary.js";
import {
  createMapGestureForwarder,
} from "./page-adapter/gesture-forwarding.js";
import { createMapViewResolver } from "./page-adapter/map-view.js";
import { createPageContext } from "./page-adapter/page-context.js";
import { createPageProjection } from "./page-adapter/projection.js";
import { createPageSnapshotSource } from "./page-adapter/snapshot-source.js";
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
  let notifySnapshotChanged = () => {};
  let handleStructureMutation = () => notifySnapshotChanged();

  // TODO(smell): Page context and snapshot source are mutually wired through
  // late-bound callbacks. Extract an observation graph factory so retargeting
  // and snapshot notification dependencies are explicit.
  const pageContext = createPageContext({
    hashTarget,
    viewportDocument,
    onChange: () => notifySnapshotChanged(),
    onStructureMutation: () => handleStructureMutation(),
    onContextRetarget: viewportGeometry.clearViewportElement,
  });

  const snapshotSource = createPageSnapshotSource({
    hashTarget,
    pageContext,
    viewportGeometry,
    mapViewResolver,
    runBoundary,
  });
  notifySnapshotChanged = snapshotSource.notifyIfChanged;
  handleStructureMutation = snapshotSource.handleStructureMutation;

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

  const pageSession = {
    isSupported: pageContext.isSupported,
    destroy: snapshotSource.destroy,
  };
  const pageObservation = {
    getSnapshot: snapshotSource.getSnapshot,
    subscribe: snapshotSource.subscribe,
  };
  const mapGesture = {
    // TODO(smell): Map gesture methods expose imperative begin/update/end ports.
    // The ideal page adapter would accept a typed gesture command/fact object
    // once target resolution and event forwarding are split.
    beginMapPan(screenPoint) {
      return runBoundary("begin-map-pan", () => {
        return gestureForwarder.beginMapPan(screenPoint);
      }, false);
    },
    updateMapPan(screenPoint) {
      return runBoundary("update-map-pan", () => {
        return gestureForwarder.updateMapPan(screenPoint);
      }, false);
    },
    endMapPan(screenPoint) {
      runBoundary("end-map-pan", () => {
        gestureForwarder.endMapPan(screenPoint);
      });
    },
    forwardMapZoom({ screenPoint, deltaX = 0, deltaY = 0, deltaMode = 0 }) {
      return runBoundary("forward-map-zoom", () => {
        return gestureForwarder.forwardMapZoom({
          screenPoint,
          deltaX,
          deltaY,
          deltaMode,
        });
      }, false);
    },
    isForwardedMapGestureEvent(event) {
      return gestureForwarder.isForwardedMapGestureEvent(event);
    },
  };

  return {
    pageSession,
    pageObservation,
    pageProjection,
    mapGesture,
  };
}
