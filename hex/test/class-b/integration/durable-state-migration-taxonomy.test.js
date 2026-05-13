import test from "node:test";
import assert from "node:assert/strict";

import {
  bootstrapBrowserExtension,
} from "../../../bootstrap/index.js";

// Class-b, deliberately not class-a: exact migration policy may change, but the
// browser-shell boundary is stable. Unsupported stored product shapes must be
// quarantined and cleared as one startup recovery path, including nested fields
// that are not currently visible in the panel.
test("unsupported durable-state variants all recover to empty startup state", async (t) => {
  for (const { name, durableState } of unsupportedDurableStates()) {
    await t.test(name, async () => {
      const storage = createDurableStorageHarness({
        durableState,
      });
      const host = createBrowserHostHarness({
        durableStatePort: storage.port,
      });

      const result = await bootstrapBrowserExtension(host);

      assert.deepEqual(result.runtime.getState(), {});
      assert.deepEqual(storage.writes, [null]);
      assert.equal(host.latestRender.view.overlay.visible, false);
    });
  }
});

// Class-b: old releases persisted map-centered placement records. Those are
// recoverable only with live page context; they must not be treated as the same
// corrupt-placement bucket as arbitrary malformed durable state.
test("legacy map-centered placement migrates through a live page snapshot", async () => {
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
  assert.deepEqual(result.runtime.getState(), currentDurableImageState({
    referenceImage,
    placement: canonicalPlacement,
    opacity: 0.5,
  }));
  assert.deepEqual(storage.writes, [currentDurableImageState({
    referenceImage,
    placement: canonicalPlacement,
    opacity: 0.5,
  })]);
});

// Class-b: if page context is not usable yet, the shell should keep the image
// recoverable instead of clearing the whole durable record or guessing a
// placement. A later page-observation lifecycle can reconcile it.
test("unresolved legacy map-centered placement keeps the image session", async () => {
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
  assert.deepEqual(result.runtime.getState(), currentDurableImageState({
    referenceImage,
    opacity: 0.5,
  }));
  assert.deepEqual(storage.writes, []);
});

function unsupportedDurableStates() {
  const referenceImage = normalizedReferenceImage();
  return [
    {
      name: "extra top-level field",
      durableState: {
        ...durableImageState({ referenceImage }),
        staleLegacyRoot: true,
      },
    },
    {
      name: "invalid image dimensions",
      durableState: durableImageState({
        referenceImage: {
          ...referenceImage,
          intrinsicSizePx: {
            width: 0,
            height: 480,
          },
        },
      }),
    },
    {
      name: "invalid placement shape",
      durableState: durableImageState({
        referenceImage,
        placement: placement({
          scale: 0,
        }),
      }),
    },
    {
      name: "invalid opacity",
      durableState: durableImageState({
        referenceImage,
        opacity: 1.5,
      }),
    },
    {
      name: "invalid registration pin shape",
      durableState: {
        session: {
          mode: "align",
          referenceImage,
          registration: {
            pins: [{
              id: "legacy-string-id",
              imagePx: {
                x: 10,
                y: 20,
              },
            }],
          },
        },
      },
    },
  ];
}

function createBrowserHostHarness({
  durableStatePort,
  pageSnapshotPort = undefined,
  legacyPlacementMigrationPort = undefined,
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
  return currentDurableImageState({
    referenceImage,
    placement: placementData,
    opacity: 0.5,
  });
}

function currentDurableImageState({
  referenceImage,
  placement: placementData = undefined,
  opacity = undefined,
}) {
  return durableImageState({
    referenceImage,
    placement: placementData,
    opacity,
  });
}

function durableImageState({
  referenceImage,
  placement: placementData = undefined,
  opacity = undefined,
}) {
  const session = {
    mode: "align",
    referenceImage,
  };
  if (placementData !== undefined) {
    session.placement = placementData;
  }
  if (opacity !== undefined) {
    session.opacity = opacity;
  }
  return {
    session,
  };
}

function normalizedReferenceImage() {
  return {
    imageDataRef: "data:image/png;base64,reference-image",
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
