import test from "node:test";
import assert from "node:assert/strict";

import {
  bootstrapBrowserExtension,
} from "../../../bootstrap/index.js";

// Class-c: placement command laws are class-a; this candidate is about the
// still-unsettled interaction projection layer. It invents a `placementEditPort`
// that turns drag facts into committed placement values. Promote only after
// overlay gesture composition has one named boundary between DOM facts,
// projection geometry, and application commands.
test("overlay move interaction updates placement render and persistence in Align", async () => {
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

// Class-c: rotate/scale should converge on the same placement command shape, but
// this test currently chooses the wheel-fact vocabulary and projection port.
// Keep it quarantined until those are adapter facts, not product assumptions.
test("overlay rotate and scale interactions converge on committed placement facts", async () => {
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

// Class-c: opacity durability and non-history posture are class-a. This composed
// scenario should become promotable only when the UI input that selects opacity
// is real and routes through `set-opacity`; this guessed `opacityEditPort` is
// not an architecture decision.
test("opacity interaction updates overlay opacity durably without history", async () => {
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

// Class-c: Trace/native-map posture is class-a for placement input, but this
// stale-fact bundle mixes three questions: overlay event containment, projection
// ports, and whether opacity input is available in Trace. Split and promote only
// after those interaction boundaries are named separately.
test("Trace ignores overlay placement and opacity interactions", async () => {
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
