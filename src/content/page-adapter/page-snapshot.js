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

export function createPageSnapshot({
  viewportElement = null,
  mountElement = null,
  viewportRect,
  localViewportRect,
  mapView,
  surfaceMotion,
  viewportProvenance = createPageViewportProvenance(PAGE_VIEWPORT_PROVENANCE_KIND.ELEMENT),
  provenance = createPageSnapshotProvenance(PAGE_SNAPSHOT_PROVENANCE_KIND.LIVE, {
    viewportProvenance,
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
    }),
  });
}

export function createStalePageSnapshot(snapshot) {
  return {
    ...snapshot,
    provenance: createPageSnapshotProvenance(PAGE_SNAPSHOT_PROVENANCE_KIND.STALE, {
      viewportProvenance: normalizeViewportProvenance(snapshot?.provenance?.viewport),
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
} = {}) {
  return {
    kind,
    viewport: normalizeViewportProvenance(viewportProvenance),
  };
}

export function createPageViewportProvenance(kind) {
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
    normalizeViewportProvenanceKind(left?.viewport) === normalizeViewportProvenanceKind(right?.viewport);
}

function normalizePageSnapshotProvenance(provenance) {
  return createPageSnapshotProvenance(normalizeProvenanceKind(provenance), {
    viewportProvenance: normalizeViewportProvenance(provenance?.viewport),
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
