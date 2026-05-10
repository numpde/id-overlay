import test from "node:test";
import assert from "node:assert/strict";

import {
  bootstrapBrowserExtension,
} from "../../../bootstrap/index.js";

// Unclassified: placement app laws are class-a, but the composed user path is
// not settled. Overlay drag should become a committed placement edit through an
// interaction boundary, then render and persist as one lifecycle.
test("candidate: overlay move interaction updates placement render and persistence in Align", async () => {
  const storage = createDurableStorageHarness({
    durableState: durableImageState({
      mode: "align",
    }),
  });
  const host = createBrowserHostHarness({
    durableStatePort: storage.port,
    placementEditPort: createPlacementEditHarness({
      placement: movedPlacement(),
    }).port,
  });

  await bootstrapBrowserExtension(host);
  await host.dispatchInteractionFact({
    kind: "overlay-move-committed",
    screenDeltaPx: {
      x: 80,
      y: 40,
    },
  });

  assert.deepEqual(host.latestRender.view.overlay.placement, movedPlacement());
  assert.deepEqual(storage.writes, [durableImageState({
    mode: "align",
    placement: movedPlacement(),
  })]);
});

// Unclassified: rotate/scale are different gestures but not different product
// concepts after composition. They should converge on committed placement facts
// before persistence and rendering.
test("candidate: overlay rotate and scale interactions converge on committed placement facts", async () => {
  const storage = createDurableStorageHarness({
    durableState: durableImageState({
      mode: "align",
    }),
  });
  const placementEdits = createPlacementEditHarness({
    placements: [rotatedPlacement(), scaledPlacement()],
  });
  const host = createBrowserHostHarness({
    durableStatePort: storage.port,
    placementEditPort: placementEdits.port,
  });

  await bootstrapBrowserExtension(host);
  await host.dispatchInteractionFact({
    kind: "overlay-rotate-wheel",
    deltaY: -100,
  });
  await host.dispatchInteractionFact({
    kind: "overlay-scale-wheel",
    deltaY: -100,
  });

  assert.deepEqual(host.latestRender.view.overlay.placement, scaledPlacement());
  assert.deepEqual(storage.writes, [
    durableImageState({
      mode: "align",
      placement: rotatedPlacement(),
    }),
    durableImageState({
      mode: "align",
      placement: scaledPlacement(),
    }),
  ]);
});

// Unclassified: opacity is durable but not undoable at the application layer.
// The composed shell still needs a user interaction path that changes visible
// opacity and writes durable state without creating history controls.
test("candidate: opacity interaction updates overlay opacity durably without history", async () => {
  const storage = createDurableStorageHarness({
    durableState: durableImageState({
      mode: "align",
    }),
  });
  const opacity = createOpacityEditHarness({
    opacity: 0.5,
  });
  const host = createBrowserHostHarness({
    durableStatePort: storage.port,
    opacityEditPort: opacity.port,
  });

  await bootstrapBrowserExtension(host);
  await host.dispatchInteractionFact({
    kind: "overlay-opacity-wheel",
    deltaY: 100,
  });

  assert.equal(host.latestRender.view.overlay.opacity, 0.5);
  assert.deepEqual(host.latestRender.view.history, {
    undo: {
      enabled: false,
      label: null,
    },
    redo: {
      enabled: false,
      label: null,
    },
  });
  assert.deepEqual(storage.writes, [durableImageState({
    mode: "align",
    opacity: 0.5,
  })]);
});

// Unclassified: Trace is native-map posture. If stale overlay interactions leak
// through, the composed shell must keep placement and opacity durable state
// inert just like the application laws require.
test("candidate: Trace ignores overlay placement and opacity interactions", async () => {
  const storage = createDurableStorageHarness({
    durableState: durableImageState({
      mode: "trace",
    }),
  });
  const host = createBrowserHostHarness({
    durableStatePort: storage.port,
    placementEditPort: createPlacementEditHarness({
      placement: movedPlacement(),
    }).port,
    opacityEditPort: createOpacityEditHarness({
      opacity: 0.5,
    }).port,
  });

  const result = await bootstrapBrowserExtension(host);
  await host.dispatchInteractionFact({
    kind: "overlay-move-committed",
  });
  await host.dispatchInteractionFact({
    kind: "overlay-opacity-wheel",
  });

  assert.deepEqual(result.runtime.getState(), durableImageState({
    mode: "trace",
  }));
  assert.deepEqual(host.latestRender.view.overlay.placement, null);
  assert.equal(host.latestRender.view.overlay.opacity, 1);
  assert.deepEqual(storage.writes, []);
});

function createBrowserHostHarness({
  durableStatePort,
  placementEditPort = createPlacementEditHarness().port,
  opacityEditPort = createOpacityEditHarness().port,
}) {
  return {
    pageContext: {
      kind: "supported-map-editor-page",
    },
    durableStatePort,
    placementEditPort,
    opacityEditPort,
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

function createPlacementEditHarness({
  placement = movedPlacement(),
  placements = [placement],
} = {}) {
  const pending = [...placements];
  return {
    port: {
      commitPlacementEdit() {
        return {
          kind: "committed",
          placement: pending.shift() ?? placement,
        };
      },
    },
  };
}

function createOpacityEditHarness({ opacity = 1 } = {}) {
  return {
    port: {
      selectOpacity() {
        return {
          kind: "selected",
          opacity,
        };
      },
    },
  };
}

function durableImageState({ mode, placement, opacity }) {
  const session = {
    mode,
    referenceImage: normalizedReferenceImage(),
  };
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

function movedPlacement() {
  return {
    x: 80,
    y: 40,
    scale: 1,
    rotationRad: 0,
  };
}

function rotatedPlacement() {
  return {
    x: 80,
    y: 40,
    scale: 1,
    rotationRad: 0.5,
  };
}

function scaledPlacement() {
  return {
    x: 80,
    y: 40,
    scale: 1.5,
    rotationRad: 0,
  };
}
