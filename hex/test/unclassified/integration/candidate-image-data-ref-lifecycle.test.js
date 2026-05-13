import test from "node:test";
import assert from "node:assert/strict";

import {
  bootstrapBrowserExtension,
} from "../../../bootstrap/index.js";

// Unclassified candidate: application opacity around image refs is stable, but release
// semantics are not. Data URLs need no release, object URLs do, and extension
// URLs may be cache-owned. This test should be rewritten after choosing the
// image-ref strategy; until then `imageDataRefPort.releaseImageDataRef` is a
// speculative adapter, not a class-b shell boundary.
test("clearing a reference image releases its runtime image data ref outside app state", async () => {
  const oldImage = normalizedReferenceImage("old-runtime-ref");
  const storage = createDurableStorageHarness({
    durableState: durableImageState({
      referenceImage: oldImage,
    }),
  });
  const imageDataRefs = createImageDataRefHarness();
  const host = createBrowserHostHarness({
    durableStatePort: storage.port,
    imageDataRefPort: imageDataRefs.port,
  });

  await bootstrapBrowserExtension(host);
  await host.latestRender.dispatchCommand({
    kind: "activate-primary-action",
  });
  await host.latestRender.dispatchCommand({
    kind: "activate-primary-action",
  });

  assert.deepEqual(imageDataRefs.releasedRefs, [oldImage.imageDataRef]);
  assert.deepEqual(storage.writes, [null]);
});

function createBrowserHostHarness({ durableStatePort, imageDataRefPort }) {
  return {
    pageContext: {
      kind: "supported-map-editor-page",
    },
    durableStatePort,
    imageDataRefPort,
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

function durableImageState({ referenceImage }) {
  return {
    session: {
      mode: "align",
      referenceImage,
    },
  };
}

function normalizedReferenceImage(label) {
  return {
    imageDataRef: `data:image/png;base64,${label}`,
    intrinsicSizePx: {
      width: 640,
      height: 480,
    },
  };
}

function createImageDataRefHarness() {
  const releasedRefs = [];
  return {
    releasedRefs,
    port: {
      releaseImageDataRef(imageDataRef) {
        releasedRefs.push(imageDataRef);
      },
    },
  };
}
