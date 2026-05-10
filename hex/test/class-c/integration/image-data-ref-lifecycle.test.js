import test from "node:test";
import assert from "node:assert/strict";

import {
  bootstrapBrowserExtension,
} from "../../../bootstrap/index.js";

// Class-c: image refs should remain opaque to the application, but the browser
// shell does not yet own an image-data-ref release adapter. Promote after the
// shell can observe old/new visible image refs without putting resource cleanup
// policy into durable state.
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
