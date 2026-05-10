import test from "node:test";
import assert from "node:assert/strict";

import {
  bootstrapBrowserExtension,
} from "../../../bootstrap/index.js";
import {
  createBrowserHostHarness,
  createDurableStorageHarness,
  durableImageState,
  firstPin,
} from "./candidate-browser-harness.js";

// Unclassified: hit testing can be implemented by DOM geometry, canvas math, or
// page projection. The invariant is higher-level: pointer facts are projected at
// the shell boundary and the app receives only semantic pin toggles.
test("candidate: overlay pointer hit-test removes an existing pin through semantic dispatch", async () => {
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

// Unclassified: projection miss is a normal runtime fact. It must be inert:
// no fallback pin at (0,0), no durable write, and no accidental map event leak.
test("candidate: overlay pointer projection miss is inert", async () => {
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
