import test from "node:test";
import assert from "node:assert/strict";

import {
  bootstrapBrowserExtension,
} from "../../../bootstrap/index.js";

// Unclassified: pass-through is transient interaction posture, not durable app
// mode. This candidate captures the composed browser loop: keyboard facts should
// temporarily make Align behave like native map interaction, then restore Align
// editing without storage writes.
test("candidate: temporary pass-through changes visible interaction posture without durability", async () => {
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

// Unclassified: reload continuity is the user-visible consequence of durable
// writes. After a shell edit writes placement and opacity, a fresh bootstrap
// from that durable state should render the same overlay facts without replaying
// the old interaction.
test("candidate: fresh bootstrap renders the latest durable placement and opacity", async () => {
  const durableState = durableImageState({
    mode: "align",
    placement: movedPlacement(),
    opacity: 0.5,
  });
  const host = createBrowserHostHarness({
    durableStatePort: createDurableStorageHarness({
      durableState,
    }).port,
  });

  await bootstrapBrowserExtension(host);

  assert.deepEqual(host.latestRender.view.overlay, {
    visible: true,
    imageDataRef: normalizedReferenceImage().imageDataRef,
    intrinsicSizePx: normalizedReferenceImage().intrinsicSizePx,
    placement: movedPlacement(),
    opacity: 0.5,
    pins: [],
  });
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

function durableImageState({ mode, pins, placement, opacity }) {
  const session = {
    mode,
    referenceImage: normalizedReferenceImage(),
  };
  if (pins !== undefined) {
    session.registration = {
      pins,
    };
  }
  if (placement !== undefined) {
    session.placement = placement;
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

function movedPlacement() {
  return {
    x: 80,
    y: 40,
    scale: 1,
    rotationRad: 0,
  };
}
