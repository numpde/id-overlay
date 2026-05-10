import test from "node:test";
import assert from "node:assert/strict";

import {
  bootstrapBrowserExtension,
} from "../../../bootstrap/index.js";

// Class-c: the user behavior is real, but ownership is not settled. Selecting
// Trace with enough pins should fit the overlay and hide pins. This candidate
// makes the browser shell call `registrationSolverPort` before dispatching
// `select-mode`; a cleaner design may instead make the pure application/domain
// transition solve from pins it already owns. Promote only after that ownership
// decision is made, then keep exactly one path.
test("selecting Trace with two pins solves placement, hides pins, and persists fit", async () => {
  const storage = createDurableStorageHarness({
    durableState: durableImageState({
      mode: "align",
      pins: [firstPin(), secondPin()],
    }),
  });
  const solver = createRegistrationSolverHarness({
    result: {
      kind: "solved",
      placement: solvedPlacement(),
    },
  });
  const host = createBrowserHostHarness({
    durableStatePort: storage.port,
    registrationSolverPort: solver.port,
  });

  await bootstrapBrowserExtension(host);
  await host.latestRender.dispatchCommand({
    kind: "select-mode",
    mode: "trace",
  });

  assert.deepEqual(solver.solvedPins, [firstPin(), secondPin()]);
  assert.deepEqual(host.latestRender.view.overlay.placement, solvedPlacement());
  assert.deepEqual(host.latestRender.view.overlay.pins, []);
  assert.deepEqual(storage.writes, [{
    session: {
      ...durableImageState({
        mode: "trace",
        pins: [firstPin(), secondPin()],
      }).session,
      placement: solvedPlacement(),
      registration: {
        pins: [firstPin(), secondPin()],
        solvedPlacement: solvedPlacement(),
      },
    },
  }]);
});

// Class-c: solve failure is also an ownership/UX decision, not a missing line of
// code. The current candidate chooses "still enter Trace, but fabricate no
// placement"; that may be right, but it should be decided with the same
// registration-solve boundary as the success path.
test("failed registration solve switches to Trace without fabricating placement", async () => {
  const storage = createDurableStorageHarness({
    durableState: durableImageState({
      mode: "align",
      pins: [firstPin(), secondPin()],
    }),
  });
  const solver = createRegistrationSolverHarness({
    result: {
      kind: "failed",
      reason: "degenerate-pins",
    },
  });
  const host = createBrowserHostHarness({
    durableStatePort: storage.port,
    registrationSolverPort: solver.port,
  });

  const result = await bootstrapBrowserExtension(host);
  await host.latestRender.dispatchCommand({
    kind: "select-mode",
    mode: "trace",
  });

  assert.equal(solver.callCount, 1);
  assert.equal(result.runtime.getState().session.placement, undefined);
  assert.deepEqual(host.latestRender.view.overlay.pins, []);
  assert.deepEqual(storage.writes, [durableImageState({
    mode: "trace",
    pins: [firstPin(), secondPin()],
  })]);
});

function createBrowserHostHarness({
  durableStatePort,
  registrationSolverPort,
}) {
  return {
    pageContext: {
      kind: "supported-map-editor-page",
    },
    durableStatePort,
    registrationSolverPort,
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

function createRegistrationSolverHarness({ result }) {
  let callCount = 0;
  let solvedPins = null;
  return {
    get callCount() {
      return callCount;
    },
    get solvedPins() {
      return solvedPins;
    },
    port: {
      solveRegistrationPlacement({ pins }) {
        callCount += 1;
        solvedPins = pins;
        return result;
      },
    },
  };
}

function durableImageState({ mode, pins }) {
  return {
    session: {
      mode,
      referenceImage: normalizedReferenceImage(),
      ...(pins === undefined ? {} : {
        registration: {
          pins,
        },
      }),
    },
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

function solvedPlacement() {
  return {
    x: 100,
    y: 200,
    scale: 1.25,
    rotationRad: 0.1,
  };
}
