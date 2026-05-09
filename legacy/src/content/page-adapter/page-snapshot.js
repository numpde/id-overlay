import {
  createSurfaceMotion,
  createWindowViewportRect,
} from "./dom.js";

export const PAGE_SNAPSHOT_PROVENANCE_KIND = Object.freeze({
  LIVE: "live",
  STALE: "stale",
  SYNTHETIC: "synthetic",
});

export const PAGE_VIEWPORT_PROVENANCE_KIND = Object.freeze({
  ELEMENT: "element",
  FALLBACK: "fallback",
});

export const PAGE_MAP_VIEW_PROVENANCE_KIND = Object.freeze({
  PRECISE: "precise",
  RETAINED: "retained",
  HASH: "hash",
  DEFAULT: "default",
});

export function createPageSnapshot({
  viewportElement = null,
  mountElement = null,
  viewportRect,
  localViewportRect,
  mapView,
  surfaceMotion,
  viewportProvenance = createPageViewportProvenance(PAGE_VIEWPORT_PROVENANCE_KIND.ELEMENT),
  mapViewProvenance = createPageMapViewProvenance(PAGE_MAP_VIEW_PROVENANCE_KIND.PRECISE),
  provenance = createPageSnapshotProvenance(PAGE_SNAPSHOT_PROVENANCE_KIND.LIVE, {
    viewportProvenance,
    mapViewProvenance,
  }),
}) {
  return {
    viewportElement,
    mountElement,
    viewportRect,
    localViewportRect,
    mapView,
    surfaceMotion,
    provenance: normalizePageSnapshotProvenance(provenance),
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
    provenance: createPageSnapshotProvenance(PAGE_SNAPSHOT_PROVENANCE_KIND.SYNTHETIC, {
      viewportProvenance: createPageViewportProvenance(PAGE_VIEWPORT_PROVENANCE_KIND.FALLBACK),
      mapViewProvenance: createPageMapViewProvenance(PAGE_MAP_VIEW_PROVENANCE_KIND.DEFAULT),
    }),
  });
}

export function createStalePageSnapshot(snapshot) {
  return {
    ...snapshot,
    provenance: createPageSnapshotProvenance(PAGE_SNAPSHOT_PROVENANCE_KIND.STALE, {
      viewportProvenance: normalizeViewportProvenance(snapshot?.provenance?.viewport),
      mapViewProvenance: normalizeMapViewProvenance(snapshot?.provenance?.mapView),
    }),
  };
}

export function isLivePageSnapshot(snapshot) {
  return snapshot != null &&
    normalizeProvenanceKind(snapshot.provenance) === PAGE_SNAPSHOT_PROVENANCE_KIND.LIVE;
}

export function pageSnapshotsEqual(left, right) {
  return (
    left.viewportElement === right.viewportElement &&
    left.mountElement === right.mountElement &&
    rectsEqual(left.viewportRect, right.viewportRect) &&
    rectsEqual(left.localViewportRect, right.localViewportRect) &&
    mapViewsEqual(left.mapView, right.mapView) &&
    surfaceMotionsEqual(left.surfaceMotion, right.surfaceMotion) &&
    provenancesEqual(left.provenance, right.provenance)
  );
}

function createPageSnapshotProvenance(kind, {
  viewportProvenance = createPageViewportProvenance(PAGE_VIEWPORT_PROVENANCE_KIND.ELEMENT),
  mapViewProvenance = createPageMapViewProvenance(PAGE_MAP_VIEW_PROVENANCE_KIND.PRECISE),
} = {}) {
  return {
    kind,
    viewport: normalizeViewportProvenance(viewportProvenance),
    mapView: normalizeMapViewProvenance(mapViewProvenance),
  };
}

export function createPageViewportProvenance(kind) {
  return { kind };
}

export function createPageMapViewProvenance(kind) {
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

function provenancesEqual(left, right) {
  return normalizeProvenanceKind(left) === normalizeProvenanceKind(right) &&
    normalizeViewportProvenanceKind(left?.viewport) === normalizeViewportProvenanceKind(right?.viewport) &&
    normalizeMapViewProvenanceKind(left?.mapView) === normalizeMapViewProvenanceKind(right?.mapView);
}

function normalizePageSnapshotProvenance(provenance) {
  return createPageSnapshotProvenance(normalizeProvenanceKind(provenance), {
    viewportProvenance: normalizeViewportProvenance(provenance?.viewport),
    mapViewProvenance: normalizeMapViewProvenance(provenance?.mapView),
  });
}

function normalizeProvenanceKind(provenance) {
  return provenance?.kind ?? PAGE_SNAPSHOT_PROVENANCE_KIND.LIVE;
}

function normalizeViewportProvenance(provenance) {
  return createPageViewportProvenance(normalizeViewportProvenanceKind(provenance));
}

function normalizeViewportProvenanceKind(provenance) {
  return provenance?.kind ?? PAGE_VIEWPORT_PROVENANCE_KIND.ELEMENT;
}

function normalizeMapViewProvenance(provenance) {
  return createPageMapViewProvenance(normalizeMapViewProvenanceKind(provenance));
}

function normalizeMapViewProvenanceKind(provenance) {
  return provenance?.kind ?? PAGE_MAP_VIEW_PROVENANCE_KIND.PRECISE;
}
