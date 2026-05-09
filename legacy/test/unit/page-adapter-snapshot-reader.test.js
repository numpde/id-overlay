import test from "node:test";
import assert from "node:assert/strict";

import { createPageSnapshotReader } from "../../src/content/page-adapter/snapshot-reader.js";
import {
  PAGE_MAP_VIEW_PROVENANCE_KIND,
  PAGE_SNAPSHOT_PROVENANCE_KIND,
  createPageMapViewProvenance,
} from "../../src/content/page-adapter/page-snapshot.js";

test("page snapshot reader builds live snapshots from page context, geometry, and map view facts", () => {
  const reader = createSnapshotReader();

  const snapshot = reader.readSnapshot();

  assert.equal(snapshot.provenance.kind, PAGE_SNAPSHOT_PROVENANCE_KIND.LIVE);
  assert.deepEqual(snapshot.viewportRect, createRect());
  assert.deepEqual(snapshot.mapView.center, {
    lat: -1.22645,
    lon: 36.82597,
  });
  assert.equal(snapshot.provenance.mapView.kind, PAGE_MAP_VIEW_PROVENANCE_KIND.PRECISE);
});

test("page snapshot reader returns stale provenance after a live snapshot when read fails", () => {
  let failSnapshotRead = false;
  const reader = createSnapshotReader({
    runBoundary(_operation, fn) {
      return failSnapshotRead
        ? { ok: false }
        : {
            ok: true,
            value: fn(),
          };
    },
  });
  const liveSnapshot = reader.readSnapshot();
  failSnapshotRead = true;

  const fallbackSnapshot = reader.readSnapshot({ lastSnapshot: liveSnapshot });

  assert.equal(fallbackSnapshot.provenance.kind, PAGE_SNAPSHOT_PROVENANCE_KIND.STALE);
  assert.deepEqual(
    {
      ...fallbackSnapshot,
      provenance: liveSnapshot.provenance,
    },
    liveSnapshot,
  );
});

test("page snapshot reader returns synthetic provenance when initial read fails", () => {
  const reader = createSnapshotReader({
    runBoundary() {
      return { ok: false };
    },
  });

  const fallbackSnapshot = reader.readSnapshot();

  assert.equal(fallbackSnapshot.provenance.kind, PAGE_SNAPSHOT_PROVENANCE_KIND.SYNTHETIC);
  assert.deepEqual(fallbackSnapshot.viewportRect, {
    left: 0,
    top: 0,
    width: 1440,
    height: 900,
  });
  assert.deepEqual(fallbackSnapshot.mapView.center, { lat: 0, lon: 0 });
});

function createSnapshotReader({
  runBoundary = (_operation, fn) => ({
    ok: true,
    value: fn(),
  }),
} = {}) {
  const context = {
    mapWindow: {},
    viewportDocument: {},
    frameElement: null,
  };
  return createPageSnapshotReader({
    hashTarget: {
      innerWidth: 1440,
      innerHeight: 900,
    },
    pageContext: {
      getActiveMapContext() {
        return context;
      },
    },
    viewportGeometry: {
      resolveViewportGeometry() {
        return {
          viewportElement: null,
          mountElement: null,
          viewportRect: createRect(),
          localViewportRect: createRect(),
        };
      },
      resolveSurfaceMotion() {
        return {
          transformCss: "none",
          transformOriginCss: "0px 0px",
        };
      },
    },
    mapViewResolver: {
      resolveMapView() {
        return {
          mapView: createMapView(),
          mapViewProvenance: createPageMapViewProvenance(PAGE_MAP_VIEW_PROVENANCE_KIND.PRECISE),
        };
      },
      getFallbackMapView() {
        return createMapView({
          center: { lat: 0, lon: 0 },
          zoom: 2,
        });
      },
    },
    runBoundary,
  });
}

function createRect(overrides = {}) {
  return {
    left: 0,
    top: 0,
    width: 900,
    height: 600,
    ...overrides,
  };
}

function createMapView(overrides = {}) {
  return {
    center: {
      lat: -1.22645,
      lon: 36.82597,
    },
    zoom: 16,
    ...overrides,
  };
}
