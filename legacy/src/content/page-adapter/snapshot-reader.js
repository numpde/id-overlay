import {
  createFallbackPageSnapshot,
  createPageSnapshot,
  createStalePageSnapshot,
} from "./page-snapshot.js";

export function createPageSnapshotReader({
  hashTarget,
  pageContext,
  viewportGeometry,
  mapViewResolver,
  runBoundary,
}) {
  function readSnapshot({ lastSnapshot = null } = {}) {
    const result = runBoundary("get-snapshot", () => {
      return createPageSnapshot(resolveSnapshotState(pageContext.getActiveMapContext()));
    });
    return result.ok ? result.value : createFallbackSnapshot(lastSnapshot);
  }

  function resolveSnapshotState(context) {
    const viewport = viewportGeometry.resolveViewportGeometry(context);
    const surfaceMotion = viewportGeometry.resolveSurfaceMotion(context);
    const mapView = mapViewResolver.resolveMapView(context, {
      viewportRect: viewport.viewportRect,
      surfaceMotion,
    });
    return {
      viewportElement: viewport.viewportElement,
      mountElement: viewport.mountElement,
      viewportRect: viewport.viewportRect,
      localViewportRect: viewport.localViewportRect,
      viewportProvenance: viewport.viewportProvenance,
      mapView: mapView.mapView,
      mapViewProvenance: mapView.mapViewProvenance,
      surfaceMotion,
    };
  }

  function createFallbackSnapshot(lastSnapshot) {
    if (lastSnapshot) {
      return createStalePageSnapshot(lastSnapshot);
    }
    return createFallbackPageSnapshot({
      hashTarget,
      mapView: mapViewResolver.getFallbackMapView(),
    });
  }

  return {
    readSnapshot,
  };
}
