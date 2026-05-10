import test from "node:test";
import assert from "node:assert/strict";

import {
  bootstrapBrowserExtension,
} from "../../../bootstrap/index.js";
import {
  createBrowserHostHarness,
  createDurableStorageHarness,
  durableImageState,
  normalizedReferenceImage,
} from "./candidate-browser-harness.js";

// Unclassified: the final image-ref strategy may be data URLs, object URLs, or
// extension URLs. The no-regret lifecycle is independent of that choice: the
// app stores opaque refs, while the shell owns releasing runtime image resources
// when a visible image leaves the session.
test("candidate: clearing a reference image releases its runtime image data ref outside app state", async () => {
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
