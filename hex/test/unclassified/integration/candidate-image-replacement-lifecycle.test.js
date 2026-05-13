import test from "node:test";
import assert from "node:assert/strict";

import {
  bootstrapBrowserExtension,
} from "../../../bootstrap/index.js";

// Unclassified candidate: the invariant is stable: a newly accepted screenshot
// starts a fresh session and must not inherit old placement or pins. This test
// stays unclassified because it expresses that behavior through a speculative
// clipboard port and a brittle sequence of raw primary-action commands. A
// promotable version should say "clear image, then paste a new image" through a
// user/browser harness.
test("loading a new image after clear starts a fresh image session", async () => {
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

function createBrowserHostHarness({
  durableStatePort,
  clipboardImagePort,
}) {
  return {
    pageContext: {
      kind: "supported-map-editor-page",
    },
    durableStatePort,
    clipboardImagePort,
    latestRender: null,
    runtime: null,
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
      this.runtime = runtime;
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

function createClipboardImageHarness({
  readReferenceImageResults = [{
    kind: "empty",
  }],
} = {}) {
  const pending = [...readReferenceImageResults];
  return {
    port: {
      async readReferenceImage() {
        return pending.shift() ?? {
          kind: "empty",
        };
      },
    },
  };
}

function durableImageState({
  referenceImage,
  placement: placementData = undefined,
  pins = undefined,
}) {
  const session = {
    mode: "align",
    referenceImage,
  };
  if (placementData !== undefined) {
    session.placement = placementData;
  }
  if (pins !== undefined) {
    session.registration = {
      pins,
    };
  }
  return {
    session,
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

function firstPin() {
  return {
    id: 1,
    imagePx: {
      x: 320,
      y: 240,
    },
    mapLatLon: {
      lat: -1.23,
      lon: 36.84,
    },
  };
}
