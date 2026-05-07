import {
  createSurfaceMotion,
  createWindowViewportRect,
} from "./dom.js";

export const PAGE_SNAPSHOT_PROVENANCE_KIND = Object.freeze({
  LIVE: "live",
  STALE: "stale",
  SYNTHETIC: "synthetic",
});

export function createPageSnapshot({
  viewportElement = null,
  mountElement = null,
  viewportRect,
  localViewportRect,
  mapView,
  surfaceMotion,
  provenance = createPageSnapshotProvenance(PAGE_SNAPSHOT_PROVENANCE_KIND.LIVE),
}) {
  return {
    viewportElement,
    mountElement,
    viewportRect,
    localViewportRect,
    mapView,
    surfaceMotion,
    provenance,
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
    provenance: createPageSnapshotProvenance(PAGE_SNAPSHOT_PROVENANCE_KIND.SYNTHETIC),
  });
}

export function createStalePageSnapshot(snapshot) {
  return {
    ...snapshot,
    provenance: createPageSnapshotProvenance(PAGE_SNAPSHOT_PROVENANCE_KIND.STALE),
  };
}

export function pageSnapshotsEqual(left, right) {
  return (
    left.viewportElement === right.viewportElement &&
    left.mountElement === right.mountElement &&
    rectsEqual(left.viewportRect, right.viewportRect) &&
    rectsEqual(left.localViewportRect, right.localViewportRect) &&
    mapViewsEqual(left.mapView, right.mapView) &&
    surfaceMotionsEqual(left.surfaceMotion, right.surfaceMotion) &&
    provenanceKindsEqual(left.provenance, right.provenance)
  );
}

function createPageSnapshotProvenance(kind) {
  return { kind };
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

function provenanceKindsEqual(left, right) {
  return normalizeProvenanceKind(left) === normalizeProvenanceKind(right);
}

function normalizeProvenanceKind(provenance) {
  return provenance?.kind ?? PAGE_SNAPSHOT_PROVENANCE_KIND.LIVE;
}
