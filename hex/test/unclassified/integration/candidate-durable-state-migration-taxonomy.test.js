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
  placement,
} from "./candidate-browser-harness.js";

// Unclassified: startup recovery exists in class-b, but the taxonomy is still
// candidate-level. The intended cut is uncompromising: every unsupported stored
// product shape is quarantined at hydration and cleared, instead of being
// partially accepted because one nested member happens to be unused today.
test("candidate: unsupported durable-state variants all recover to empty startup state", async (t) => {
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
