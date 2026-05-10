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

function createBrowserHostHarness({ durableStatePort }) {
  return {
    pageContext: {
      kind: "supported-map-editor-page",
    },
    durableStatePort,
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
