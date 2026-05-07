import test from "node:test";
import assert from "node:assert/strict";

import {
  createFallbackPageSnapshot,
  createPageSnapshot,
  pageSnapshotsEqual,
} from "../../src/content/page-adapter/page-snapshot.js";

test("page snapshot factory preserves the canonical snapshot shape", () => {
  const viewportElement = {};
  const mountElement = {};
  const snapshot = createPageSnapshot({
    viewportElement,
    mountElement,
    viewportRect: createRect({ left: 10 }),
    localViewportRect: createRect(),
    mapView: createMapView(),
    surfaceMotion: createSurfaceMotion(),
  });

  assert.deepEqual(Object.keys(snapshot), [
    "viewportElement",
    "mountElement",
    "viewportRect",
    "localViewportRect",
    "mapView",
    "surfaceMotion",
  ]);
  assert.equal(snapshot.viewportElement, viewportElement);
  assert.equal(snapshot.mountElement, mountElement);
});

test("fallback page snapshot uses the window viewport, fallback map view, and inert surface motion", () => {
  const mapView = createMapView({
    center: { lat: -1.2, lon: 36.8 },
    zoom: 16,
  });

  assert.deepEqual(
    createFallbackPageSnapshot({
      hashTarget: {
        innerWidth: 1440,
        innerHeight: 900,
      },
      mapView,
    }),
    {
      viewportElement: null,
      mountElement: null,
      viewportRect: {
        left: 0,
        top: 0,
        width: 1440,
        height: 900,
      },
      localViewportRect: {
        left: 0,
        top: 0,
        width: 1440,
        height: 900,
      },
      mapView,
      surfaceMotion: {
        transformCss: "none",
        transformOriginCss: "0px 0px",
      },
    },
  );
});

test("page snapshot equality compares every semantic snapshot field", () => {
  const base = createSnapshot();

  assert.equal(pageSnapshotsEqual(base, createSnapshot()), true);
  assert.equal(pageSnapshotsEqual(base, createSnapshot({
    viewportElement: {},
  })), false);
  assert.equal(pageSnapshotsEqual(base, createSnapshot({
    mountElement: {},
  })), false);
  assert.equal(pageSnapshotsEqual(base, createSnapshot({
    viewportRect: createRect({ width: 901 }),
  })), false);
  assert.equal(pageSnapshotsEqual(base, createSnapshot({
    localViewportRect: createRect({ height: 601 }),
  })), false);
  assert.equal(pageSnapshotsEqual(base, createSnapshot({
    mapView: createMapView({ zoom: 17 }),
  })), false);
  assert.equal(pageSnapshotsEqual(base, createSnapshot({
    surfaceMotion: createSurfaceMotion({ transformCss: "matrix(1, 0, 0, 1, 1, 2)" }),
  })), false);
});

function createSnapshot(overrides = {}) {
  return createPageSnapshot({
    viewportElement: null,
    mountElement: null,
    viewportRect: createRect(),
    localViewportRect: createRect(),
    mapView: createMapView(),
    surfaceMotion: createSurfaceMotion(),
    ...overrides,
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

function createSurfaceMotion(overrides = {}) {
  return {
    transformCss: "none",
    transformOriginCss: "0px 0px",
    ...overrides,
  };
}
