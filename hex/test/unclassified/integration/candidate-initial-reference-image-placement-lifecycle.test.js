import test from "node:test";
import assert from "node:assert/strict";

import {
  bootstrapBrowserExtension,
} from "../../../bootstrap/index.js";

// Unclassified candidate: legacy paste placed the newly loaded image from the
// current live map view. The behavior is user-visible, but the hex seam is not
// settled: this test proposes that the shell reads a page snapshot, asks a
// placement port to derive an initial placement, and reports one accepted image
// outcome that becomes one durable session write. A promotable version should
// keep the same atomic "load image with initial placement" assertion while
// using the final page-observation and placement-derivation ports.
test("accepted reference image is initially placed from a live map snapshot", async () => {
  const referenceImage = normalizedReferenceImage();
  const liveMapSnapshot = supportedMapSnapshot();
  const initialPlacement = placement({
    x: 320,
    y: 120,
    scale: 1,
    rotationRad: 0,
  });
  const storage = createDurableStorageHarness({
    durableState: null,
  });
  const input = createReferenceImageInputHarness();
  const initialPlacementPort = createInitialPlacementHarness({
    placement: initialPlacement,
  });
  const host = createBrowserHostHarness({
    durableStatePort: storage.port,
    referenceImageInputPort: input.port,
    pageSnapshotPort: {
      readSnapshot() {
        return liveMapSnapshot;
      },
    },
    initialReferenceImagePlacementPort: initialPlacementPort.port,
  });

  const result = await bootstrapBrowserExtension(host);
  await host.latestRender.dispatchCommand({
    kind: "activate-primary-action",
  });
  await input.reportOutcome(1, {
    kind: "accepted",
    referenceImage,
  });

  assert.deepEqual(initialPlacementPort.calls, [{
    referenceImage,
    pageSnapshot: liveMapSnapshot,
  }]);
  assert.deepEqual(result.runtime.getState(), {
    session: {
      mode: "align",
      referenceImage,
      placement: initialPlacement,
    },
  });
  assert.deepEqual(storage.writes, [{
    session: {
      mode: "align",
      referenceImage,
      placement: initialPlacement,
    },
  }]);
});

// Unclassified candidate: initial placement is allowed only from a live map
// snapshot. If page observation is unavailable, loading the image should still
// succeed, but the shell must not invent a default placement or ask the
// placement-derivation port to guess.
test("accepted reference image is not initially placed without a live map snapshot", async () => {
  const referenceImage = normalizedReferenceImage();
  const storage = createDurableStorageHarness({
    durableState: null,
  });
  const input = createReferenceImageInputHarness();
  const initialPlacementPort = createInitialPlacementHarness({
    placement: placement(),
  });
  const host = createBrowserHostHarness({
    durableStatePort: storage.port,
    referenceImageInputPort: input.port,
    pageSnapshotPort: {
      readSnapshot() {
        return {
          kind: "unavailable-map-snapshot",
          reason: "missing-map-view",
        };
      },
    },
    initialReferenceImagePlacementPort: initialPlacementPort.port,
  });

  const result = await bootstrapBrowserExtension(host);
  await host.latestRender.dispatchCommand({
    kind: "activate-primary-action",
  });
  await input.reportOutcome(1, {
    kind: "accepted",
    referenceImage,
  });

  assert.deepEqual(initialPlacementPort.calls, []);
  assert.deepEqual(result.runtime.getState(), {
    session: {
      mode: "align",
      referenceImage,
    },
  });
  assert.deepEqual(storage.writes, [{
    session: {
      mode: "align",
      referenceImage,
    },
  }]);
});

function createBrowserHostHarness({
  durableStatePort,
  referenceImageInputPort,
  pageSnapshotPort,
  initialReferenceImagePlacementPort,
}) {
  return {
    pageContext: {
      kind: "supported-map-editor-page",
    },
    durableStatePort,
    referenceImageInputPort,
    pageSnapshotPort,
    initialReferenceImagePlacementPort,
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

function createReferenceImageInputHarness() {
  const starts = [];
  const reporters = new Map();
  return {
    starts,
    async reportOutcome(requestId, outcome) {
      await reporters.get(requestId)?.(outcome);
    },
    port: {
      startReferenceImageInput({ requestId, intent, reportOutcome }) {
        starts.push({
          requestId,
          intent,
        });
        reporters.set(requestId, reportOutcome);
      },
      cancelReferenceImageInput() {},
    },
  };
}

function createInitialPlacementHarness({ placement: nextPlacement }) {
  const calls = [];
  return {
    calls,
    port: {
      createInitialReferenceImagePlacement({ referenceImage, pageSnapshot }) {
        calls.push({
          referenceImage,
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

function supportedMapSnapshot() {
  return {
    kind: "supported-map-page",
    mapView: {
      zoom: 16,
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
