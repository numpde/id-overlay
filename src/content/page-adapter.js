import { createLogger } from "../core/logger.js";
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
  const viewportGeometry = createViewportGeometryResolver({ hashTarget });
  const mapViewResolver = createMapViewResolver();
  let notifySnapshotChanged = () => {};
  let handleStructureMutation = () => notifySnapshotChanged();

  function runAdapterBoundary(operation, fn, fallbackValue = undefined) {
    // TODO(smell): Adapter fallbacks keep the extension alive but can mask
    // projection/page-integration regressions. Keep fallback values boring and
    // make real adapter behavior observable in tests.
    try {
      return fn();
    } catch (error) {
      logger.error("Page adapter boundary failed", {
        operation,
      }, error);
      return typeof fallbackValue === "function" ? fallbackValue(error) : fallbackValue;
    }
  }

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
    runBoundary: runAdapterBoundary,
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
      return runAdapterBoundary("client-point-to-screen", () => {
        return projection.clientPointToScreen(clientPoint);
      }, {
        x: clientPoint?.x ?? 0,
        y: clientPoint?.y ?? 0,
      });
    },
    screenPointToClient(screenPoint) {
      return runAdapterBoundary("screen-point-to-client", () => {
        return projection.screenPointToClient(screenPoint);
      }, {
        x: screenPoint?.x ?? 0,
        y: screenPoint?.y ?? 0,
      });
    },
    mapToScreen(point) {
      return runAdapterBoundary("map-to-screen", () => {
        return projection.mapToScreen(point);
      }, { x: 0, y: 0 });
    },
    mapToOverlayLayerScreen(point) {
      return runAdapterBoundary("map-to-overlay-layer-screen", () => {
        return projection.mapToOverlayLayerScreen(point);
      }, { x: 0, y: 0 });
    },
    screenToMap(screenPoint) {
      return runAdapterBoundary("screen-to-map", () => {
        return projection.screenToMap(screenPoint);
      }, mapViewResolver.getFallbackMapView().center);
    },
  };
  const mapGesture = {
    beginMapPan(screenPoint) {
      return runAdapterBoundary("begin-map-pan", () => {
        return gestureForwarder.beginMapPan(screenPoint);
      }, false);
    },
    updateMapPan(screenPoint) {
      return runAdapterBoundary("update-map-pan", () => {
        return gestureForwarder.updateMapPan(screenPoint);
      }, false);
    },
    endMapPan(screenPoint) {
      runAdapterBoundary("end-map-pan", () => {
        gestureForwarder.endMapPan(screenPoint);
      });
    },
    forwardMapZoom({ screenPoint, deltaX = 0, deltaY = 0, deltaMode = 0 }) {
      return runAdapterBoundary("forward-map-zoom", () => {
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
