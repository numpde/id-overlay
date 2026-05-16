import test from "node:test";
import assert from "node:assert/strict";

import {
  bootstrapBrowserExtension,
} from "../../../bootstrap/index.js";
import {
  createFlowTrace,
  flowEdge,
} from "../../support/flow-trace.js";

// Class-b: legacy behavior makes this a solid user-facing lifecycle. Selecting
// Trace with enough registration pins fits the overlay, hides pins, and
// persists the fitted Trace session. The harness uses a solver port because the
// final ownership boundary is still provisional; unclassified candidates keep
// the alternative "solve inside application" pressure visible.
test("selecting Trace with two pins solves placement, hides pins, and persists fit", async () => {
  const trace = createRegistrationSolveTrace("selecting Trace with two pins solves placement, hides pins, and persists fit");
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
  assert.equal(host.latestRender.view.status, "Fit overlay from 2 pins.");
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
  traceRegistrationSolve(trace, "solved-registration", true);
});

// Class-b: registration solving may keep solved-transform provenance, but Trace
// rendering uses the same map-locked placement contract as hand placement. Pins
// and transforms author placement; they do not create a separate rendering path.
test("selecting Trace with two pins normalizes solved transform to map-locked placement", async () => {
  const trace = createRegistrationSolveTrace("selecting Trace with two pins normalizes solved transform to map-locked placement");
  const storage = createDurableStorageHarness({
    durableState: durableImageState({
      mode: "align",
      pins: [firstPin(), secondPin()],
    }),
  });
  const solver = createRegistrationSolverHarness({
    result: {
      kind: "solved",
      solvedTransform: solvedTransform(),
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

  assert.deepEqual(result.runtime.getState().session.placement, solvedPlacementFromTransform());
  assert.deepEqual(result.runtime.getState().session.registration, {
    pins: [firstPin(), secondPin()],
    solvedTransform: solvedTransform(),
  });
  assert.deepEqual(host.latestRender.view.overlay.pageProjectionSource, {
    kind: "map-locked-placement",
    mode: "trace",
  });
  assert.deepEqual(host.latestRender.view.overlay.placement, solvedPlacementFromTransform());
  assert.deepEqual(storage.writes, [{
    session: {
      ...durableImageState({
        mode: "trace",
        pins: [firstPin(), secondPin()],
      }).session,
      placement: solvedPlacementFromTransform(),
      registration: {
        pins: [firstPin(), secondPin()],
        solvedTransform: solvedTransform(),
      },
    },
  }]);
  traceRegistrationSolve(trace, "solved-map-locked-placement", true);
});

// Class-b: the legacy fallback entered Trace without fabricating a solved
// placement when fitting failed. Exact failure copy/retry UX can evolve, but
// a failed solve must not invent placement data.
test("failed registration solve switches to Trace without fabricating placement", async () => {
  const trace = createRegistrationSolveTrace("failed registration solve switches to Trace without fabricating placement");
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
  traceRegistrationSolve(trace, "failed-registration", true);
});

// Class-b: fitting on the way into Trace is shell-composed because the solver is
// a port, but the user-visible transition is semantic history. Undo returns to
// the editable Align pin set; redo restores the fitted Trace posture.
test("selecting Trace with solvable pins is an undoable fit transition", async () => {
  const trace = createRegistrationSolveTrace("selecting Trace with solvable pins is an undoable fit transition");
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

  const result = await bootstrapBrowserExtension(host);
  await dispatchRenderedCommand({
    trace,
    dispatchCommand: host.latestRender.dispatchCommand,
    command: {
      kind: "select-mode",
      mode: "trace",
    },
    phase: "fit",
  });
  await dispatchRenderedCommand({
    trace,
    dispatchCommand: host.latestRender.dispatchCommand,
    command: {
      kind: "undo",
    },
    phase: "undo-fit",
  });

  assert.equal(result.runtime.getState().session.mode, "align");
  assert.equal(result.runtime.getState().session.placement, undefined);
  assert.deepEqual(result.runtime.getState().session.registration, {
    pins: [firstPin(), secondPin()],
  });

  await dispatchRenderedCommand({
    trace,
    dispatchCommand: host.latestRender.dispatchCommand,
    command: {
      kind: "redo",
    },
    phase: "redo-fit",
  });

  assert.equal(result.runtime.getState().session.mode, "trace");
  assert.deepEqual(result.runtime.getState().session.placement, solvedPlacement());
  assert.deepEqual(result.runtime.getState().session.registration, {
    pins: [firstPin(), secondPin()],
    solvedPlacement: solvedPlacement(),
  });
});

// Class-b: mode selection itself is not an undoable semantic edit. If the
// solver returns the exact fitted placement already carried by the session,
// entering Trace should persist the mode change but must not create a fit
// history record that lets undo bounce back to Align.
test("selecting Trace with unchanged fit does not create undo or redo", async () => {
  const trace = createRegistrationSolveTrace("selecting Trace with unchanged fit does not create undo or redo");
  const storage = createDurableStorageHarness({
    durableState: durableImageState({
      mode: "align",
      pins: [firstPin(), secondPin()],
      placement: solvedPlacement(),
      solvedPlacement: solvedPlacement(),
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

  const result = await bootstrapBrowserExtension(host);
  await dispatchRenderedCommand({
    trace,
    dispatchCommand: host.latestRender.dispatchCommand,
    command: {
      kind: "select-mode",
      mode: "trace",
    },
    phase: "unchanged-fit",
  });

  assert.equal(result.runtime.getState().session.mode, "trace");
  assert.deepEqual(result.runtime.getState().session.placement, solvedPlacement());
  assert.deepEqual(result.runtime.getState().session.registration, {
    pins: [firstPin(), secondPin()],
    solvedPlacement: solvedPlacement(),
  });

  await dispatchRenderedCommand({
    trace,
    dispatchCommand: host.latestRender.dispatchCommand,
    command: {
      kind: "undo",
    },
    phase: "undo-unchanged-fit",
  });
  await dispatchRenderedCommand({
    trace,
    dispatchCommand: host.latestRender.dispatchCommand,
    command: {
      kind: "redo",
    },
    phase: "redo-unchanged-fit",
  });

  assert.equal(result.runtime.getState().session.mode, "trace");
  assert.deepEqual(result.runtime.getState().session.placement, solvedPlacement());
  assert.deepEqual(result.runtime.getState().session.registration, {
    pins: [firstPin(), secondPin()],
    solvedPlacement: solvedPlacement(),
  });
  assert.deepEqual(storage.writes, [durableImageState({
    mode: "trace",
    pins: [firstPin(), secondPin()],
    placement: solvedPlacement(),
    solvedPlacement: solvedPlacement(),
  })]);
});

function createRegistrationSolveTrace(testName) {
  return createFlowTrace({
    file: import.meta.url,
    test: testName,
  });
}

function traceRegistrationSolve(trace, phase, persists) {
  trace.edge(flowEdge("source.rendered-command", "command.select-mode", {
    phase,
    provider: "rendered-ui",
  }));
  trace.edge(flowEdge("command.select-mode", "effect.solve-registration-placement", {
    phase,
    provider: "application-effect",
  }));
  trace.edge(flowEdge("effect.solve-registration-placement", "port.registration-solver", {
    phase,
    provider: "browser-shell",
  }));
  trace.edge(flowEdge("port.registration-solver", "callback.registration-solve-result", {
    phase,
    provider: "registration-solver-port",
  }));
  trace.edge(flowEdge("callback.registration-solve-result", "command.registration-solve-result", {
    phase,
    provider: "browser-shell",
  }));
  trace.edge(flowEdge("command.registration-solve-result", "sink.render", {
    phase,
    terminal: "render-result",
  }));
  if (!persists) {
    return;
  }
  trace.edge(flowEdge("command.registration-solve-result", "effect.persist-durable-state", {
    phase,
    provider: "application-effect",
  }));
  trace.edge(flowEdge("effect.persist-durable-state", "port.durable-state.write", {
    phase,
    provider: "browser-shell",
  }));
  trace.edge(flowEdge("port.durable-state.write", "sink.durable-state.write", {
    phase,
    terminal: "storage-write",
  }));
}

async function dispatchRenderedCommand({
  trace,
  dispatchCommand,
  command,
  phase,
}) {
  const source = `source.rendered-command.${command.kind}`;
  trace.edge(flowEdge(source, `command.${command.kind}`, {
    phase,
    provider: "rendered-ui",
  }));
  await trace.withAttributes({ phase }, () => (
    trace.withSource(`command.${command.kind}`, () => dispatchCommand(command))
  ));
  trace.edge(flowEdge(`command.${command.kind}`, "sink.render", {
    phase,
    terminal: "render-result",
  }));
}

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

function durableImageState({
  mode,
  pins,
  placement,
  solvedPlacement,
}) {
  return {
    session: {
      mode,
      referenceImage: normalizedReferenceImage(),
      ...(placement === undefined ? {} : {
        placement,
      }),
      ...(pins === undefined ? {} : {
        registration: {
          pins,
          ...(solvedPlacement === undefined ? {} : {
            solvedPlacement,
          }),
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

function solvedPlacementFromTransform() {
  return {
    x: solvedTransform().tx,
    y: solvedTransform().ty,
    scale: solvedTransform().scale,
    rotationRad: solvedTransform().rotationRad,
    coordinateSpace: "map-world",
  };
}

function solvedTransform() {
  return {
    type: "image-to-map-world",
    a: 0.01,
    b: 0,
    tx: 100,
    ty: 200,
    scale: 0.01,
    rotationRad: 0,
    pinIds: [1, 2],
  };
}
