import {
  createSurfaceMotion,
  createWindowViewportRect,
} from "./dom.js";

export function createPageSnapshot({
  viewportElement = null,
  mountElement = null,
  viewportRect,
  localViewportRect,
  mapView,
  surfaceMotion,
}) {
  return {
    viewportElement,
    mountElement,
    viewportRect,
    localViewportRect,
    mapView,
    surfaceMotion,
  };
}

export function createFallbackPageSnapshot({ hashTarget, mapView }) {
  const viewportRect = createWindowViewportRect(hashTarget);
  return createPageSnapshot({
    viewportElement: null,
    mountElement: null,
    viewportRect,
    localViewportRect: viewportRect,
    mapView,
    surfaceMotion: createSurfaceMotion(),
  });
}

export function pageSnapshotsEqual(left, right) {
  return (
    left.viewportElement === right.viewportElement &&
    left.mountElement === right.mountElement &&
    rectsEqual(left.viewportRect, right.viewportRect) &&
    rectsEqual(left.localViewportRect, right.localViewportRect) &&
    mapViewsEqual(left.mapView, right.mapView) &&
    surfaceMotionsEqual(left.surfaceMotion, right.surfaceMotion)
  );
}

function rectsEqual(left, right) {
  return (
    left.left === right.left &&
    left.top === right.top &&
    left.width === right.width &&
    left.height === right.height
  );
}

function mapViewsEqual(left, right) {
  return (
    left.zoom === right.zoom &&
    left.center.lat === right.center.lat &&
    left.center.lon === right.center.lon
  );
}

function surfaceMotionsEqual(left, right) {
  return (
    left.transformCss === right.transformCss &&
    left.transformOriginCss === right.transformOriginCss
  );
}
