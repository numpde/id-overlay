import test from "node:test";
import assert from "node:assert/strict";

import {
  bootstrapBrowserExtension,
} from "../../../bootstrap/index.js";
import {
  createBrowserHostHarness,
  createClipboardImageHarness,
  createDurableStorageHarness,
  durableImageState,
  firstPin,
  normalizedReferenceImage,
  placement,
} from "./candidate-browser-harness.js";

// Unclassified: the final UI affordance for replacement is not settled. The
// product invariant is still useful: once a new screenshot is accepted after
// clearing, stale placement and registration from the old screenshot must not
// bleed into the new session.
test("candidate: loading a new image after clear starts a fresh image session", async () => {
  const oldImage = normalizedReferenceImage("old");
  const newImage = normalizedReferenceImage("new");
  const storage = createDurableStorageHarness({
    durableState: durableImageState({
      referenceImage: oldImage,
      placement: placement({
        x: 30,
        y: 40,
        scale: 2,
        rotationRad: 0.4,
      }),
      pins: [firstPin()],
    }),
  });
  const clipboard = createClipboardImageHarness({
    readReferenceImageResults: [{
      kind: "accepted",
      referenceImage: newImage,
    }],
  });
  const host = createBrowserHostHarness({
    durableStatePort: storage.port,
    clipboardImagePort: clipboard.port,
  });

  await bootstrapBrowserExtension(host);
  await host.latestRender.dispatchCommand({
    kind: "activate-primary-action",
  });
  await host.latestRender.dispatchCommand({
    kind: "activate-primary-action",
  });
  await host.latestRender.dispatchCommand({
    kind: "activate-primary-action",
  });
  await host.latestRender.dispatchCommand({
    kind: "activate-primary-action",
  });
  await host.latestRender.dispatchCommand({
    kind: "activate-primary-action",
  });

  assert.deepEqual(host.runtime.getState(), {
    session: {
      mode: "align",
      referenceImage: newImage,
    },
  });
  assert.deepEqual(storage.writes, [
    durableImageState({
      referenceImage: oldImage,
      placement: placement({
        x: 30,
        y: 40,
        scale: 2,
        rotationRad: 0.4,
      }),
    }),
    null,
    {
      session: {
        mode: "align",
        referenceImage: newImage,
      },
    },
  ]);
});
