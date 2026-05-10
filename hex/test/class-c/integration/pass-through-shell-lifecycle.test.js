import test from "node:test";
import assert from "node:assert/strict";

import {
  bootstrapBrowserExtension,
} from "../../../bootstrap/index.js";

// Class-c: the pieces are stable, but the composed seam is not. Keyboard facts
// and the derived view posture are tested elsewhere; this candidate requires the
// browser shell to wire interaction facts into transient application state and
// re-render without durability. Promote only after that shell interaction
// runtime is the single path for Space/temporary-pass-through behavior.
test("temporary pass-through changes visible interaction posture without durability", async () => {
  const storage = createDurableStorageHarness({
    durableState: durableImageState({
      mode: "align",
      pins: [firstPin()],
    }),
  });
  const host = createBrowserHostHarness({
    durableStatePort: storage.port,
  });

  await bootstrapBrowserExtension(host);
  assert.deepEqual(host.latestRender.view.overlayInput, {
    kind: "overlay-editing",
    canEditOverlay: true,
    arePinsVisible: true,
  });

  await host.dispatchInteractionFact({
    kind: "temporary-pass-through-pressed",
  });
  assert.deepEqual(host.latestRender.view.overlayInput, {
    kind: "native-map",
    canEditOverlay: false,
    arePinsVisible: false,
    reason: "temporary-pass-through",
  });

  await host.dispatchInteractionFact({
    kind: "temporary-pass-through-released",
  });
  assert.deepEqual(host.latestRender.view.overlayInput, {
    kind: "overlay-editing",
    canEditOverlay: true,
    arePinsVisible: true,
  });
  assert.deepEqual(storage.writes, []);
});

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
    async dispatchInteractionFact(fact) {
      if (typeof this.handleInteractionFact !== "function") {
        throw new TypeError("browser shell did not expose interaction-fact dispatch");
      }
      await this.handleInteractionFact(fact);
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

function durableImageState({ mode, pins }) {
  const session = {
    mode,
    referenceImage: {
      imageDataRef: "data:image/png;base64,reference-image",
      intrinsicSizePx: {
        width: 640,
        height: 480,
      },
    },
  };
  if (pins !== undefined) {
    session.registration = {
      pins,
    };
  }
  return {
    session,
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
