import test from "node:test";
import assert from "node:assert/strict";

import { createPageSnapshotSource } from "../../src/content/page-adapter/snapshot-source.js";
import {
  PAGE_MAP_VIEW_PROVENANCE_KIND,
  createPageSnapshot,
  createPageMapViewProvenance,
} from "../../src/content/page-adapter/page-snapshot.js";

test("page snapshot source reads snapshots with the last notified snapshot", () => {
  const calls = [];
  const liveSnapshot = createLiveSnapshot();
  const nextSnapshot = createLiveSnapshot({
    mapView: createMapView({ zoom: 17 }),
  });
  const source = createSnapshotSource({
    snapshotReader: {
      readSnapshot({ lastSnapshot }) {
        calls.push(lastSnapshot);
        return calls.length === 1 ? liveSnapshot : nextSnapshot;
      },
    },
  });

  source.notifyIfChanged();
  const readSnapshot = source.getSnapshot();

  assert.deepEqual(calls, [null, liveSnapshot]);
  assert.deepEqual(readSnapshot, nextSnapshot);
});

test("page snapshot source emits only changed snapshots", () => {
  const receivedSnapshots = [];
  const liveSnapshot = createLiveSnapshot();
  const source = createSnapshotSource({
    snapshotReader: {
      readSnapshot() {
        return liveSnapshot;
      },
    },
  });

  const unsubscribe = source.subscribe((snapshot) => {
    receivedSnapshots.push(snapshot);
  });
  source.notifyIfChanged();
  source.notifyIfChanged();
  unsubscribe();

  assert.deepEqual(receivedSnapshots, [liveSnapshot]);
});

test("page snapshot source delegates subscriber lifecycle to injected observation hooks", () => {
  const calls = [];
  const source = createSnapshotSource({
    snapshotReader: {
      readSnapshot() {
        return createLiveSnapshot();
      },
    },
    onFirstSubscriber() {
      calls.push("first-subscriber");
    },
    onNoSubscribers() {
      calls.push("no-subscribers");
    },
  });

  const unsubscribe = source.subscribe(() => {});
  unsubscribe();

  assert.deepEqual(calls, [
    "first-subscriber",
    "no-subscribers",
  ]);
});

function createSnapshotSource({
  runBoundary = (_operation, fn) => ({
    ok: true,
    value: fn(),
  }),
  snapshotReader,
  viewportGeometry = {
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
  mapViewResolver = {
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
    reset() {},
  },
  onFirstSubscriber,
  onNoSubscribers,
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
      start() {},
      destroy() {},
    },
    viewportGeometry,
    mapViewResolver,
    runBoundary,
    snapshotReader,
    onFirstSubscriber,
    onNoSubscribers,
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

function createLiveSnapshot(overrides = {}) {
  return createPageSnapshot({
    viewportElement: null,
    mountElement: null,
    viewportRect: createRect(),
    localViewportRect: createRect(),
    mapView: createMapView(),
    mapViewProvenance: createPageMapViewProvenance(PAGE_MAP_VIEW_PROVENANCE_KIND.PRECISE),
    surfaceMotion: {
      transformCss: "none",
      transformOriginCss: "0px 0px",
    },
    ...overrides,
  });
}
