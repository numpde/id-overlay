import test from "node:test";
import assert from "node:assert/strict";

import {
  bootstrapBrowserExtension,
} from "../../../bootstrap/index.js";

// Unclassified candidate: the legacy app preserved old map-centered placement
// records by reconciling them through the current page view. The behavior is
// compatibility-sensitive, but the hex migration seam is unsettled. This test
// proposes that bootstrap treats legacy placement as recoverable only when a
// live map snapshot and migration port can produce canonical placement data.
test("legacy map-centered placement is reconciled through the live map snapshot", async () => {
  const referenceImage = normalizedReferenceImage();
  const legacyPlacement = legacyMapCenteredPlacement();
  const liveMapSnapshot = supportedMapSnapshot();
  const canonicalPlacement = placement({
    x: 372,
    y: 272,
    scale: 1.25,
    rotationRad: 0.5,
  });
  const storage = createDurableStorageHarness({
    durableState: legacyDurableImageState({
      referenceImage,
      placement: legacyPlacement,
    }),
  });
  const migration = createLegacyPlacementMigrationHarness({
    placement: canonicalPlacement,
  });
  const host = createBrowserHostHarness({
    durableStatePort: storage.port,
    pageSnapshotPort: {
      readSnapshot() {
        return liveMapSnapshot;
      },
    },
    legacyPlacementMigrationPort: migration.port,
  });

  const result = await bootstrapBrowserExtension(host);

  assert.deepEqual(migration.calls, [{
    referenceImage,
    legacyPlacement,
    pageSnapshot: liveMapSnapshot,
  }]);
  assert.deepEqual(result.runtime.getState(), {
    session: {
      mode: "align",
      referenceImage,
      placement: canonicalPlacement,
      opacity: 0.5,
    },
  });
  assert.deepEqual(storage.writes, [currentDurableImageState({
    referenceImage,
    placement: canonicalPlacement,
    opacity: 0.5,
  })]);
});

// Unclassified candidate: if the page view is not usable yet, legacy behavior
// kept the image session alive with unresolved placement instead of clearing the
// whole stored record. The shell may later reconcile after page observation
// becomes usable, but it must not classify this specific legacy placement shape
// as corrupt data at startup.
test("unresolved legacy map-centered placement keeps the image session pending page context", async () => {
  const referenceImage = normalizedReferenceImage();
  const storage = createDurableStorageHarness({
    durableState: legacyDurableImageState({
      referenceImage,
      placement: legacyMapCenteredPlacement(),
    }),
  });
  const migration = createLegacyPlacementMigrationHarness({
    placement: placement(),
  });
  const host = createBrowserHostHarness({
    durableStatePort: storage.port,
    pageSnapshotPort: {
      readSnapshot() {
        return {
          kind: "unavailable-map-snapshot",
          reason: "missing-map-view",
        };
      },
    },
    legacyPlacementMigrationPort: migration.port,
  });

  const result = await bootstrapBrowserExtension(host);

  assert.deepEqual(migration.calls, []);
  assert.deepEqual(result.runtime.getState(), {
    session: {
      mode: "align",
      referenceImage,
      opacity: 0.5,
    },
  });
  assert.deepEqual(storage.writes, []);
});

function createBrowserHostHarness({
  durableStatePort,
  pageSnapshotPort,
  legacyPlacementMigrationPort,
}) {
  return {
    pageContext: {
      kind: "supported-map-editor-page",
    },
    durableStatePort,
    pageSnapshotPort,
    legacyPlacementMigrationPort,
    latestRender: null,
    mountOwnedRoot(ownerId, root) {
      return {
        ...root,
        ownerId,
      };
    },
    renderApplicationView(render) {
      this.latestRender = render;
    },
    startRuntime(runtime) {
      return runtime;
    },
  };
}

function createLegacyPlacementMigrationHarness({ placement: nextPlacement }) {
  const calls = [];
  return {
    calls,
    port: {
      reconcileLegacyPlacement({ referenceImage, legacyPlacement, pageSnapshot }) {
        calls.push({
          referenceImage,
          legacyPlacement,
          pageSnapshot,
        });
        return nextPlacement;
      },
    },
  };
}

function createDurableStorageHarness({ durableState }) {
  const writes = [];
  return {
    writes,
    port: {
      async readDurableState() {
        return durableState;
      },
      async writeDurableState(nextDurableState) {
        writes.push(nextDurableState);
      },
    },
  };
}

function legacyDurableImageState({
  referenceImage,
  placement: placementData,
}) {
  return {
    session: {
      mode: "align",
      referenceImage,
      placement: placementData,
      opacity: 0.5,
    },
  };
}

function currentDurableImageState({
  referenceImage,
  placement: placementData,
  opacity,
}) {
  return {
    session: {
      mode: "align",
      referenceImage,
      placement: placementData,
      opacity,
    },
  };
}

function legacyMapCenteredPlacement() {
  return {
    centerMapLatLon: {
      lat: 0,
      lon: 0,
    },
    scale: 1.25,
    rotationRad: 0.5,
  };
}

function supportedMapSnapshot() {
  return {
    kind: "supported-map-page",
    mapView: {
      zoom: 17,
      centerLatLon: {
        lat: -1.24401,
        lon: 36.82412,
      },
    },
    viewportPx: {
      width: 1280,
      height: 720,
    },
    tileTransform: {
      x: -240,
      y: -180,
      scale: 1,
    },
  };
}

function normalizedReferenceImage() {
  return {
    imageDataRef: "reference-image-data-1",
    intrinsicSizePx: {
      width: 640,
      height: 480,
    },
  };
}

function placement({
  x = 80,
  y = 40,
  scale = 1,
  rotationRad = 0,
} = {}) {
  return {
    x,
    y,
    scale,
    rotationRad,
  };
}
