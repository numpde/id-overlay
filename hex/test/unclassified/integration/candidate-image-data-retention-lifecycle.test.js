import test from "node:test";
import assert from "node:assert/strict";

import {
  bootstrapBrowserExtension,
} from "../../../bootstrap/index.js";

// Unclassified candidate: stored image bytes are browser-shell resources, but cleanup cannot
// follow only the durable projection. Clear image writes durable `null`, yet
// undo history still references the old ref. This requires a reference-image
// store port and live-ref graph that are not implemented yet.
//
// Decision: keep unclassified. The retention policy is important, but it must
// land with the broader runtime resource ownership layer rather than as an
// isolated bootstrap expectation.
test("clearing a reference image keeps stored image data live while undo can reload it", async () => {
  const oldImage = normalizedReferenceImage("old");
  const storage = createDurableStorageHarness({
    durableState: durableImageState(oldImage),
  });
  const imageStore = createReferenceImageStoreHarness();
  const host = createBrowserHostHarness({
    durableStatePort: storage.port,
    referenceImageStorePort: imageStore.port,
  });

  await bootstrapBrowserExtension(host);
  await host.latestRender.dispatchCommand({
    kind: "activate-primary-action",
  });
  await host.latestRender.dispatchCommand({
    kind: "activate-primary-action",
  });

  assert.deepEqual(storage.writes, [null]);
  assert.deepEqual(imageStore.liveRefSnapshots.at(-1), [oldImage.imageDataRef]);
  assert.deepEqual(imageStore.releases, []);
});

// Unclassified candidate: failed persistence is an even stronger retention case, but the same
// unimplemented store/live-ref graph is required.
test("failed durable write keeps stored image data live", async () => {
  const oldImage = normalizedReferenceImage("old");
  const storage = createDurableStorageHarness({
    durableState: durableImageState(oldImage),
    failWrites: true,
  });
  const imageStore = createReferenceImageStoreHarness();
  const host = createBrowserHostHarness({
    durableStatePort: storage.port,
    referenceImageStorePort: imageStore.port,
  });

  await bootstrapBrowserExtension(host);
  await host.latestRender.dispatchCommand({
    kind: "activate-primary-action",
  });
  await host.latestRender.dispatchCommand({
    kind: "activate-primary-action",
  });

  assert.deepEqual(imageStore.liveRefSnapshots.at(-1), [oldImage.imageDataRef]);
  assert.deepEqual(imageStore.releases, []);
});

// Unclassified candidate: replacement creates two live image refs, but release/acquire
// semantics are not settled until the resource layer exists.
test("accepted replacement keeps previous and new stored image data live", async () => {
  const oldImage = normalizedReferenceImage("old");
  const newImage = normalizedReferenceImage("new");
  const storage = createDurableStorageHarness({
    durableState: durableImageState(oldImage),
  });
  const imageStore = createReferenceImageStoreHarness();
  const host = createBrowserHostHarness({
    durableStatePort: storage.port,
    referenceImageStorePort: imageStore.port,
  });

  await bootstrapBrowserExtension(host);
  await host.latestRender.dispatchCommand({
    kind: "request-reference-image-replacement",
  });

  assert.deepEqual(imageStore.releases, []);

  await host.latestRender.dispatchCommand({
    kind: "report-reference-image-input-outcome",
    requestId: 1,
    outcome: {
      kind: "accepted",
      referenceImage: newImage,
    },
  });

  assert.deepEqual(storage.writes, [durableImageState(newImage)]);
  assert.deepEqual(imageStore.liveRefSnapshots.at(-1), [
    newImage.imageDataRef,
    oldImage.imageDataRef,
  ].sort());
  assert.deepEqual(imageStore.releases, []);
});

function createBrowserHostHarness({
  durableStatePort,
  referenceImageStorePort,
}) {
  return {
    pageContext: {
      kind: "supported-map-editor-page",
    },
    durableStatePort,
    referenceImageStorePort,
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

function createDurableStorageHarness({ durableState, failWrites = false }) {
  const writes = [];
  return {
    writes,
    port: {
      async readDurableState() {
        return durableState;
      },
      async writeDurableState(nextDurableState) {
        if (failWrites) {
          throw new Error("durable write failed");
        }
        writes.push(nextDurableState);
      },
    },
  };
}

function createReferenceImageStoreHarness() {
  const releases = [];
  const liveRefSnapshots = [];
  return {
    liveRefSnapshots,
    releases,
    port: {
      async syncLiveReferenceImageDataRefs({ imageDataRefs }) {
        liveRefSnapshots.push([...imageDataRefs].sort());
      },
      async releaseReferenceImageData({ imageDataRef }) {
        releases.push({
          imageDataRef,
        });
      },
    },
  };
}

function durableImageState(referenceImage) {
  return {
    session: {
      mode: "align",
      referenceImage,
    },
  };
}

function normalizedReferenceImage(label) {
  return {
    imageDataRef: `reference-image-data-${label}`,
    intrinsicSizePx: {
      width: 640,
      height: 480,
    },
  };
}
