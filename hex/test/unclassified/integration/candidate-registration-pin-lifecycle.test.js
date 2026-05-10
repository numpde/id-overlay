import test from "node:test";
import assert from "node:assert/strict";

import {
  bootstrapBrowserExtension,
} from "../../../bootstrap/index.js";

// Unclassified: this is the composed pin-add flow, not yet settled as a
// browser-shell contract. The intended shape is that UI input asks a projection
// port for image/map facts, then the application owns the registration edit,
// durability, and rendered pin visibility.
test("candidate: Align pin toggle projects pointer, renders pin, and persists registration", async () => {
  const storage = createDurableStorageHarness({
    durableState: durableImageState({
      mode: "align",
    }),
  });
  const projection = createPinProjectionHarness({
    projection: projectedPinToggle(),
  });
  const host = createBrowserHostHarness({
    durableStatePort: storage.port,
    pinProjectionPort: projection.port,
  });

  const result = await bootstrapBrowserExtension(host);
  await host.dispatchInteractionFact({
    kind: "keyboard-pin-toggle-requested",
  });

  assert.equal(projection.projectCount, 1);
  assert.deepEqual(result.runtime.getState().session.registration, {
    pins: [firstPin()],
  });
  assert.deepEqual(host.latestRender.view.overlay.pins, [firstPin()]);
  assert.deepEqual(storage.writes, [{
    session: {
      ...durableImageState({ mode: "align" }).session,
      registration: {
        pins: [firstPin()],
      },
    },
  }]);
});

// Unclassified: removing a pin is the same semantic toggle with a projected
// existing pin id. The composed shell must not invent separate remove behavior
// in adapters or bootstrap.
test("candidate: Align pin toggle removes projected existing pin and persists removal", async () => {
  const storage = createDurableStorageHarness({
    durableState: durableImageState({
      mode: "align",
      pins: [firstPin()],
    }),
  });
  const projection = createPinProjectionHarness({
    projection: projectedPinToggle({
      existingPinId: 1,
    }),
  });
  const host = createBrowserHostHarness({
    durableStatePort: storage.port,
    pinProjectionPort: projection.port,
  });

  const result = await bootstrapBrowserExtension(host);
  assert.deepEqual(host.latestRender.view.overlay.pins, [firstPin()]);

  await host.dispatchInteractionFact({
    kind: "keyboard-pin-toggle-requested",
  });

  assert.equal(projection.projectCount, 1);
  assert.equal(result.runtime.getState().session.registration, undefined);
  assert.deepEqual(host.latestRender.view.overlay.pins, []);
  assert.deepEqual(storage.writes, [{
    session: durableImageState({ mode: "align" }).session,
  }]);
});

// Unclassified: Trace hides pins and treats pin edits as inert even when stale
// input wiring sends interaction facts. This composed test protects the visible
// and durable halves together.
test("candidate: Trace mode hides pins and ignores pin-toggle interaction facts", async () => {
  const storage = createDurableStorageHarness({
    durableState: durableImageState({
      mode: "trace",
      pins: [firstPin()],
    }),
  });
  const projection = createPinProjectionHarness({
    projection: projectedPinToggle(),
  });
  const host = createBrowserHostHarness({
    durableStatePort: storage.port,
    pinProjectionPort: projection.port,
  });

  const result = await bootstrapBrowserExtension(host);
  await host.dispatchInteractionFact({
    kind: "keyboard-pin-toggle-requested",
  });

  assert.deepEqual(host.latestRender.view.overlay.pins, []);
  assert.deepEqual(result.runtime.getState().session.registration, {
    pins: [firstPin()],
  });
  assert.deepEqual(storage.writes, []);
});

// Unclassified: clear-pins already has class-a application coverage. This
// candidate captures the composed browser-visible lifecycle: confirmation,
// durability, and overlay pin removal must move together.
test("candidate: clearing Align pins removes rendered pins and persists image without registration", async () => {
  const storage = createDurableStorageHarness({
    durableState: durableImageState({
      mode: "align",
      pins: [firstPin(), secondPin()],
    }),
  });
  const host = createBrowserHostHarness({
    durableStatePort: storage.port,
  });

  const result = await bootstrapBrowserExtension(host);
  assert.deepEqual(host.latestRender.view.overlay.pins, [firstPin(), secondPin()]);

  await host.latestRender.dispatchCommand({
    kind: "activate-primary-action",
  });
  await host.latestRender.dispatchCommand({
    kind: "activate-primary-action",
  });

  assert.equal(result.runtime.getState().session.registration, undefined);
  assert.deepEqual(host.latestRender.view.overlay.pins, []);
  assert.deepEqual(storage.writes, [{
    session: durableImageState({ mode: "align" }).session,
  }]);
});

// Unclassified: startup hydration already reconstructs durable image sessions.
// The pin-specific browser-visible claim is that Align hydration renders pins,
// while Trace hydration preserves registration facts without showing them.
test("candidate: startup hydration renders registration pins only in Align mode", async () => {
  const alignHost = createBrowserHostHarness({
    durableStatePort: createDurableStorageHarness({
      durableState: durableImageState({
        mode: "align",
        pins: [firstPin()],
      }),
    }).port,
  });
  const traceHost = createBrowserHostHarness({
    durableStatePort: createDurableStorageHarness({
      durableState: durableImageState({
        mode: "trace",
        pins: [firstPin()],
      }),
    }).port,
  });

  await bootstrapBrowserExtension(alignHost);
  await bootstrapBrowserExtension(traceHost);

  assert.deepEqual(alignHost.latestRender.view.overlay.pins, [firstPin()]);
  assert.deepEqual(traceHost.latestRender.view.overlay.pins, []);
});

function createBrowserHostHarness({
  durableStatePort,
  pinProjectionPort = createPinProjectionHarness().port,
}) {
  return {
    pageContext: {
      kind: "supported-map-editor-page",
    },
    durableStatePort,
    pinProjectionPort,
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

function createPinProjectionHarness({
  projection = {
    kind: "failed",
    reason: "missing-pointer",
  },
} = {}) {
  let projectCount = 0;
  return {
    get projectCount() {
      return projectCount;
    },
    port: {
      projectCurrentPointerForPinToggle() {
        projectCount += 1;
        return projection;
      },
    },
  };
}

function projectedPinToggle({
  existingPinId = null,
  imagePx = firstPin().imagePx,
  mapLatLon = firstPin().mapLatLon,
} = {}) {
  return {
    kind: "projected",
    existingPinId,
    imagePx,
    mapLatLon,
  };
}

function durableImageState({ mode, pins }) {
  const session = {
    mode,
    referenceImage: normalizedReferenceImage(),
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

function secondPin() {
  return {
    id: 2,
    imagePx: {
      x: 520,
      y: 240,
    },
    mapLatLon: {
      lat: -1.23,
      lon: 38.84,
    },
  };
}
