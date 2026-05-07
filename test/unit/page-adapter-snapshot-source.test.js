import test from "node:test";
import assert from "node:assert/strict";

import { createPageSnapshotSource } from "../../src/content/page-adapter/snapshot-source.js";
import {
  PAGE_SNAPSHOT_PROVENANCE_KIND,
} from "../../src/content/page-adapter/page-snapshot.js";

test("page snapshot source returns stale provenance after a live snapshot when read fails", () => {
  let failSnapshotRead = false;
  const source = createSnapshotSource({
    runBoundary(_operation, fn, fallback) {
      return failSnapshotRead ? fallback : fn();
    },
  });

  source.notifyIfChanged();
  const liveSnapshot = source.getSnapshot();
  failSnapshotRead = true;

  const fallbackSnapshot = source.getSnapshot();

  assert.equal(liveSnapshot.provenance.kind, PAGE_SNAPSHOT_PROVENANCE_KIND.LIVE);
  assert.equal(fallbackSnapshot.provenance.kind, PAGE_SNAPSHOT_PROVENANCE_KIND.STALE);
  assert.deepEqual(
    {
      ...fallbackSnapshot,
      provenance: liveSnapshot.provenance,
    },
    liveSnapshot,
  );
});

test("page snapshot source returns synthetic provenance when initial read fails", () => {
  const source = createSnapshotSource({
    runBoundary(_operation, _fn, fallback) {
      return fallback;
    },
  });

  const fallbackSnapshot = source.getSnapshot();

  assert.equal(fallbackSnapshot.provenance.kind, PAGE_SNAPSHOT_PROVENANCE_KIND.SYNTHETIC);
  assert.deepEqual(fallbackSnapshot.viewportRect, {
    left: 0,
    top: 0,
    width: 1440,
    height: 900,
  });
});

function createSnapshotSource({
  runBoundary = (_operation, fn) => fn(),
} = {}) {
  const context = {
    mapWindow: {},
    viewportDocument: {},
    frameElement: null,
  };
  return createPageSnapshotSource({
    hashTarget: {
      innerWidth: 1440,
      innerHeight: 900,
      addEventListener() {},
      removeEventListener() {},
      requestAnimationFrame() {
        return 1;
      },
      cancelAnimationFrame() {},
    },
    pageContext: {
      getActiveMapContext() {
        return context;
      },
      syncObservedContext() {},
      start() {},
      destroy() {},
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
      refreshViewportElement() {},
      destroy() {},
    },
    mapViewResolver: {
      resolveMapView() {
        return createMapView();
      },
      getFallbackMapView() {
        return createMapView({
          center: { lat: 0, lon: 0 },
          zoom: 2,
        });
      },
      reset() {},
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
