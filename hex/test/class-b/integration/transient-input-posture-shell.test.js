import test from "node:test";
import assert from "node:assert/strict";

import {
  bootstrapBrowserExtension,
} from "../../../bootstrap/index.js";

// Class-b: this names today's shell seam, not the final browser lifecycle
// controller. The stable boundary is that source-neutral interaction facts can
// enter the app, re-render visible posture, and leave durable storage untouched.
test("temporary native-map access changes visible interaction posture without durability", async () => {
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
    kind: "temporary-native-map-access-started",
  });
  assert.equal(host.latestRender.view.mode, "align");
  assert.deepEqual(host.latestRender.view.overlayInput, {
    kind: "native-map",
    canEditOverlay: false,
    arePinsVisible: false,
    reason: "temporary-native-map-access",
  });

  await host.dispatchInteractionFact({
    kind: "temporary-native-map-access-ended",
  });
  assert.equal(host.latestRender.view.mode, "align");
  assert.deepEqual(host.latestRender.view.overlayInput, {
    kind: "overlay-editing",
    canEditOverlay: true,
    arePinsVisible: true,
  });
  assert.deepEqual(storage.writes, []);
});

// Class-b: keyboard and pointer adapters emit the same source-neutral
// registration-pin fact. The shell boundary is that the fact is projected once,
// enters the app as a semantic pin toggle, re-renders, and persists.
test("registration pin interaction fact projects to a durable visible pin", async () => {
  const projections = [];
  const storage = createDurableStorageHarness({
    durableState: durableImageState({
      mode: "align",
    }),
  });
  const host = createBrowserHostHarness({
    durableStatePort: storage.port,
    projectRegistrationPinToggle(fact) {
      projections.push(fact);
      return {
        kind: "projected",
        existingPinId: null,
        imagePx: firstPin().imagePx,
        mapLatLon: firstPin().mapLatLon,
      };
    },
  });

  await bootstrapBrowserExtension(host);
  await host.dispatchInteractionFact({
    kind: "registration-pin-toggle-requested",
  });

  assert.deepEqual(projections, [{
    kind: "registration-pin-toggle-requested",
  }]);
  assert.deepEqual(host.latestRender.view.overlay.pins, [firstPin()]);
  assert.deepEqual(storage.writes, [durableImageState({
    mode: "align",
    pins: [firstPin()],
  })]);
});

function createBrowserHostHarness({
  durableStatePort,
  projectRegistrationPinToggle = undefined,
}) {
  return {
    pageContext: {
      kind: "supported-map-editor-page",
    },
    durableStatePort,
    projectRegistrationPinToggle,
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
