import { createLogger } from "../core/logger.js";
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
  const logger = createLogger("page-adapter");
  const runBoundary = createPageAdapterBoundary({ logger });
  const viewportGeometry = createViewportGeometryResolver({ hashTarget });
  const mapViewResolver = createMapViewResolver();
  let notifySnapshotChanged = () => {};
  let handleStructureMutation = () => notifySnapshotChanged();

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
  const pageProjection = {
    clientPointToScreen(clientPoint) {
      return runBoundary("client-point-to-screen", () => {
        return projection.clientPointToScreen(clientPoint);
      }, {
        x: clientPoint?.x ?? 0,
        y: clientPoint?.y ?? 0,
      });
    },
    screenPointToClient(screenPoint) {
      return runBoundary("screen-point-to-client", () => {
        return projection.screenPointToClient(screenPoint);
      }, {
        x: screenPoint?.x ?? 0,
        y: screenPoint?.y ?? 0,
      });
    },
    mapToScreen(point) {
      return runBoundary("map-to-screen", () => {
        return projection.mapToScreen(point);
      }, { x: 0, y: 0 });
    },
    mapToOverlayLayerScreen(point) {
      return runBoundary("map-to-overlay-layer-screen", () => {
        return projection.mapToOverlayLayerScreen(point);
      }, { x: 0, y: 0 });
    },
    screenToMap(screenPoint) {
      return runBoundary("screen-to-map", () => {
        return projection.screenToMap(screenPoint);
      }, mapViewResolver.getFallbackMapView().center);
    },
  };
  const mapGesture = {
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
