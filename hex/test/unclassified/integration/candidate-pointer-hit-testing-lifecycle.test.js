import test from "node:test";
import assert from "node:assert/strict";

import {
  bootstrapBrowserExtension,
} from "../../../bootstrap/index.js";

// Unclassified candidate: the product boundary is strong, but this integration seam is not.
// Hit testing may use DOM geometry, canvas math, or page projection; the
// application must receive only semantic pin-toggle commands. This candidate
// invents `overlayInputPort.bindInput` and `inputProjectionPort.projectOverlayPointer`.
// Promote only after pointer projection is a named shell adapter contract.
test("overlay pointer hit-test removes an existing pin through semantic dispatch", async () => {
  const overlayInput = createOverlayInputHarness();
  const projection = createProjectionHarness({
    hit: {
      existingPinId: 1,
      imagePx: firstPin().imagePx,
      mapLatLon: firstPin().mapLatLon,
    },
  });
  const storage = createDurableStorageHarness({
    durableState: durableImageState({
      mode: "align",
      pins: [firstPin()],
    }),
  });
  const host = createBrowserHostHarness({
    durableStatePort: storage.port,
    overlayInputPort: overlayInput.port,
    inputProjectionPort: projection.port,
  });

  await bootstrapBrowserExtension(host);
  await overlayInput.emit({
    kind: "overlay-pointer-down",
    button: 0,
    screenPx: {
      x: 512,
      y: 288,
    },
  });

  assert.deepEqual(projection.projectedScreenPx, [{
    x: 512,
    y: 288,
  }]);
  assert.equal(host.latestRender.view.overlay.pins.length, 0);
});

// Unclassified candidate: projection miss should be inert, but the assertion belongs at the
// eventual projection-to-command boundary. Until that boundary is real, this
// test risks freezing a fake port shape rather than the user-facing no-op.
test("overlay pointer projection miss is inert", async () => {
  const overlayInput = createOverlayInputHarness();
  const projection = createProjectionHarness({
    hit: null,
  });
  const storage = createDurableStorageHarness({
    durableState: durableImageState({
      mode: "align",
    }),
  });
  const host = createBrowserHostHarness({
    durableStatePort: storage.port,
    overlayInputPort: overlayInput.port,
    inputProjectionPort: projection.port,
  });

  await bootstrapBrowserExtension(host);
  await overlayInput.emit({
    kind: "overlay-pointer-down",
    button: 0,
    screenPx: {
      x: -1,
      y: -1,
    },
  });

  assert.deepEqual(host.runtime.getState(), durableImageState({
    mode: "align",
  }));
  assert.deepEqual(storage.writes, []);
});

function createBrowserHostHarness({
  durableStatePort,
  overlayInputPort,
  inputProjectionPort,
}) {
  return {
    pageContext: {
      kind: "supported-map-editor-page",
    },
    durableStatePort,
    overlayInputPort,
    inputProjectionPort,
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

function createOverlayInputHarness() {
  let listener = null;
  return {
    port: {
      bindInput(nextListener) {
        listener = nextListener;
        return () => {};
      },
    },
    async emit(fact) {
      assert.equal(typeof listener, "function", "overlay input was not bound");
      await listener(fact);
    },
  };
}

function createProjectionHarness({ hit }) {
  const projectedScreenPx = [];
  return {
    projectedScreenPx,
    port: {
      projectOverlayPointer({ screenPx }) {
        projectedScreenPx.push(screenPx);
        return hit;
      },
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
