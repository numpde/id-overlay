import test from "node:test";
import assert from "node:assert/strict";

import {
  bootstrapBrowserExtension,
} from "../../../bootstrap/index.js";
import {
  createFlowTrace,
  flowEdge,
} from "../../support/flow-trace.js";

// Class-b: overlay placement gestures are shell-composed. The browser adapter
// may describe drag/wheel input as source-neutral interaction facts, but the
// shell must project those facts before the application sees semantic placement
// edits.
test("shell commits projected Align overlay move rotate and scale interactions", async () => {
  const trace = createOverlayShellTrace("shell commits projected Align overlay move rotate and scale interactions");
  const projectedPlacements = {
    move: placement({ x: 80, y: 40 }),
    rotate: placement({ rotationRad: 0.25 }),
    scale: placement({ scale: 1.25 }),
  };
  const projectedFacts = [];
  const storage = createDurableStorageHarness({
    durableState: durableImageState({
      mode: "align",
      placement: placement(),
    }),
  });
  const host = createBrowserHostHarness({
    durableStatePort: storage.port,
    projectPlacementEdit(fact) {
      projectedFacts.push(fact);
      trace.edge(flowEdge("callback.interaction-fact.placement-edit-requested", "port.project-placement-edit", {
        phase: fact.editKind,
        provider: "browser-shell",
      }));
      trace.edge(flowEdge("port.project-placement-edit", "sink.projection-result", {
        phase: fact.editKind,
        terminal: "port-result",
      }));
      return {
        kind: "committed",
        editKind: fact.editKind,
        placement: projectedPlacements[fact.editKind],
      };
    },
  });

  await bootstrapBrowserExtension(host);
  for (const editKind of ["move", "rotate", "scale"]) {
    await dispatchInteractionFact({
      trace,
      host,
      phase: editKind,
      fact: {
        kind: "placement-edit-requested",
        editKind,
        anchorScreenPx: {
          x: 600,
          y: 320,
        },
        inputDelta: {
          y: -100,
        },
        screenDeltaPx: {
          x: 60,
          y: -20,
        },
      },
      command: "commit-placement-edit",
      persists: true,
    });
  }

  assert.deepEqual(projectedFacts.map((fact) => fact.editKind), ["move", "rotate", "scale"]);
  assert.deepEqual(storage.writes.map((write) => write.session.placement), [
    projectedPlacements.move,
    projectedPlacements.rotate,
    projectedPlacements.scale,
  ]);
});

// Class-b: projection failure is an intentional end state for an overlay edit
// fact. The shell must not invent a placement or fall through to a native-map
// gesture when the placement projection cannot commit.
test("shell leaves unprojectable overlay placement interactions inert", async () => {
  const trace = createOverlayShellTrace("shell leaves unprojectable overlay placement interactions inert");
  const storage = createDurableStorageHarness({
    durableState: durableImageState({
      mode: "align",
      placement: placement(),
    }),
  });
  const host = createBrowserHostHarness({
    durableStatePort: storage.port,
    projectPlacementEdit() {
      trace.edge(flowEdge("callback.interaction-fact.placement-edit-requested", "port.project-placement-edit", {
        provider: "browser-shell",
      }));
      trace.edge(flowEdge("port.project-placement-edit", "sink.projection-result", {
        terminal: "port-result",
      }));
      return {
        kind: "not-committed",
        reason: "outside-reference-image",
      };
    },
  });

  await bootstrapBrowserExtension(host);
  await dispatchInteractionFact({
    trace,
    host,
    fact: {
      kind: "placement-edit-requested",
      editKind: "move",
      screenDeltaPx: {
        x: 60,
        y: -20,
      },
    },
    inert: "not-committed",
  });

  assert.deepEqual(storage.writes, []);
});

// Class-b: legacy interaction projection failures were boundary failures, not
// raw browser-event crashes. A thrown projection must be reported and leave
// durable overlay state untouched.
test("shell reports overlay projection exceptions without durable writes", async () => {
  const trace = createOverlayShellTrace("shell reports overlay projection exceptions without durable writes");
  const storage = createDurableStorageHarness({
    durableState: durableImageState({
      mode: "align",
      placement: placement(),
    }),
  });
  const projectionError = new Error("projection exploded");
  const host = createBrowserHostHarness({
    durableStatePort: storage.port,
    projectPlacementEdit() {
      trace.edge(flowEdge("callback.interaction-fact.placement-edit-requested", "port.project-placement-edit", {
        phase: "projection-exception",
        provider: "browser-shell",
      }));
      trace.edge(flowEdge("port.project-placement-edit", "sink.projection-error", {
        phase: "projection-exception",
        terminal: "boundary-rejection",
      }));
      throw projectionError;
    },
  });

  await bootstrapBrowserExtension(host);
  await assert.doesNotReject(() => dispatchInteractionFact({
    trace,
    host,
    phase: "projection-exception",
    fact: {
      kind: "placement-edit-requested",
      editKind: "move",
      screenDeltaPx: {
        x: 60,
        y: -20,
      },
    },
    inert: "projection-error",
  }));

  assert.deepEqual(host.reportedErrors, [projectionError]);
  assert.deepEqual(storage.writes, []);
});

// Class-b: placement editing is Align-only product behavior. Even when the
// browser shell can project a rendered Trace gesture, the shell/app path must
// leave placement durable state unchanged.
test("shell leaves Trace overlay placement interactions inert", async () => {
  const trace = createOverlayShellTrace("shell leaves Trace overlay placement interactions inert");
  const storage = createDurableStorageHarness({
    durableState: durableImageState({
      mode: "trace",
      placement: placement(),
    }),
  });
  const projected = placement({
    x: 80,
    y: 40,
  });
  const host = createBrowserHostHarness({
    durableStatePort: storage.port,
    projectPlacementEdit(fact) {
      trace.edge(flowEdge("callback.interaction-fact.placement-edit-requested", "port.project-placement-edit", {
        phase: `trace-${fact.editKind}`,
        provider: "browser-shell",
      }));
      trace.edge(flowEdge("port.project-placement-edit", "sink.projection-result", {
        phase: `trace-${fact.editKind}`,
        terminal: "port-result",
      }));
      return {
        kind: "committed",
        editKind: fact.editKind,
        placement: projected,
      };
    },
  });

  await bootstrapBrowserExtension(host);
  await dispatchInteractionFact({
    trace,
    host,
    phase: "trace-move",
    fact: {
      kind: "placement-edit-requested",
      editKind: "move",
      screenDeltaPx: {
        x: 60,
        y: -20,
      },
      anchorScreenPx: {
        x: 500,
        y: 300,
      },
    },
    command: "commit-placement-edit",
    persists: false,
  });

  assert.deepEqual(storage.writes, []);
  assert.deepEqual(host.latestRender.view.overlay.placement, placement());
});

// Class-b: opacity is the overlay interaction that remains meaningful in both
// Align and Trace. The shell chooses the semantic opacity value; the application
// owns durability and the no-history policy.
test("shell commits overlay opacity interactions in Align and Trace", async () => {
  const trace = createOverlayShellTrace("shell commits overlay opacity interactions in Align and Trace");
  for (const mode of ["align", "trace"]) {
    const storage = createDurableStorageHarness({
      durableState: durableImageState({
        mode,
        opacity: 0.6,
      }),
    });
    const host = createBrowserHostHarness({
      durableStatePort: storage.port,
      selectOpacity(fact) {
        trace.edge(flowEdge("callback.interaction-fact.opacity-adjustment-requested", "port.select-opacity", {
          phase: mode,
          provider: "browser-shell",
        }));
        trace.edge(flowEdge("port.select-opacity", "sink.selection-result", {
          phase: mode,
          terminal: "port-result",
        }));
        assert.equal(fact.inputDelta.y, -100);
        return {
          kind: "selected",
          opacity: 0.7,
        };
      },
    });

    await bootstrapBrowserExtension(host);
    await dispatchInteractionFact({
      trace,
      host,
      phase: mode,
      fact: {
        kind: "opacity-adjustment-requested",
        inputDelta: {
          y: -100,
        },
        anchorScreenPx: {
          x: 600,
          y: 320,
        },
      },
      command: "set-opacity",
      persists: true,
    });

    assert.deepEqual(storage.writes, [durableImageState({
      mode,
      opacity: 0.7,
    })]);
  }
});

// Class-b: pin toggles are Align-only product edits. In Align the shell must
// project the overlay point into image/map facts; in Trace the application must
// leave the hidden pin state untouched.
test("shell projects Align pin toggles and leaves Trace pin toggles inert", async () => {
  const trace = createOverlayShellTrace("shell projects Align pin toggles and leaves Trace pin toggles inert");
  const alignStorage = createDurableStorageHarness({
    durableState: durableImageState({
      mode: "align",
    }),
  });
  const alignHost = createBrowserHostHarness({
    durableStatePort: alignStorage.port,
    projectRegistrationPinToggle(fact) {
      trace.edge(flowEdge("callback.interaction-fact.registration-pin-toggle-requested", "port.project-registration-pin-toggle", {
        phase: "align",
        provider: "browser-shell",
      }));
      trace.edge(flowEdge("port.project-registration-pin-toggle", "sink.projection-result", {
        phase: "align",
        terminal: "port-result",
      }));
      assert.deepEqual(fact.screenPx, {
        x: 600,
        y: 320,
      });
      return {
        kind: "projected",
        existingPinId: null,
        imagePx: firstPin().imagePx,
        mapLatLon: firstPin().mapLatLon,
      };
    },
  });

  await bootstrapBrowserExtension(alignHost);
  await dispatchInteractionFact({
    trace,
    host: alignHost,
    phase: "align",
    fact: {
      kind: "registration-pin-toggle-requested",
      screenPx: {
        x: 600,
        y: 320,
      },
    },
    command: "toggle-registration-pin",
    persists: true,
  });
  assert.deepEqual(alignStorage.writes, [durableImageState({
    mode: "align",
    pins: [firstPin()],
  })]);

  const traceStorage = createDurableStorageHarness({
    durableState: durableImageState({
      mode: "trace",
    }),
  });
  const traceHost = createBrowserHostHarness({
    durableStatePort: traceStorage.port,
    projectRegistrationPinToggle() {
      return {
        kind: "projected",
        existingPinId: null,
        imagePx: firstPin().imagePx,
        mapLatLon: firstPin().mapLatLon,
      };
    },
  });

  await bootstrapBrowserExtension(traceHost);
  await dispatchInteractionFact({
    trace,
    host: traceHost,
    phase: "trace",
    fact: {
      kind: "registration-pin-toggle-requested",
      screenPx: {
        x: 600,
        y: 320,
      },
    },
    command: "toggle-registration-pin",
    inert: "trace-mode",
  });
  assert.deepEqual(traceStorage.writes, []);
});

// Class-b: pin projection failures are interaction-boundary failures. They
// should be reported through the shell error channel and leave registration
// state untouched.
test("shell reports registration projection exceptions without durable writes", async () => {
  const trace = createOverlayShellTrace("shell reports registration projection exceptions without durable writes");
  const storage = createDurableStorageHarness({
    durableState: durableImageState({
      mode: "align",
    }),
  });
  const projectionError = new Error("pin projection exploded");
  const host = createBrowserHostHarness({
    durableStatePort: storage.port,
    projectRegistrationPinToggle() {
      trace.edge(flowEdge("callback.interaction-fact.registration-pin-toggle-requested", "port.project-registration-pin-toggle", {
        phase: "projection-exception",
        provider: "browser-shell",
      }));
      trace.edge(flowEdge("port.project-registration-pin-toggle", "sink.projection-error", {
        phase: "projection-exception",
        terminal: "boundary-rejection",
      }));
      throw projectionError;
    },
  });

  await bootstrapBrowserExtension(host);
  await assert.doesNotReject(() => dispatchInteractionFact({
    trace,
    host,
    phase: "registration-projection-exception",
    fact: {
      kind: "registration-pin-toggle-requested",
      screenPx: {
        x: 600,
        y: 320,
      },
    },
    inert: "projection-error",
  }));

  assert.deepEqual(host.reportedErrors, [projectionError]);
  assert.deepEqual(storage.writes, []);
});

// Class-b: native-map drag/wheel facts remain explicit outbound map gestures.
// They must not mutate overlay placement, pins, or opacity while the shell
// forwards them to the page boundary.
test("shell forwards native-map pan and zoom interactions without overlay durability", async () => {
  const trace = createOverlayShellTrace("shell forwards native-map pan and zoom interactions without overlay durability");
  const forwarded = [];
  const storage = createDurableStorageHarness({
    durableState: durableImageState({
      mode: "align",
      placement: placement(),
      opacity: 0.6,
    }),
  });
  const host = createBrowserHostHarness({
    durableStatePort: storage.port,
    async forwardNativeMapGesture(fact) {
      forwarded.push(fact);
      trace.edge(flowEdge("callback.interaction-fact.native-map-gesture-requested", "port.forward-native-map-gesture", {
        phase: `${fact.gestureKind}-${fact.phase ?? "instant"}`,
        provider: "browser-shell",
      }));
      trace.edge(flowEdge("port.forward-native-map-gesture", "sink.native-map-gesture-forwarded", {
        phase: `${fact.gestureKind}-${fact.phase ?? "instant"}`,
        terminal: "port-result",
      }));
    },
  });

  await bootstrapBrowserExtension(host);
  for (const fact of [
    {
      kind: "native-map-gesture-requested",
      gestureKind: "pan",
      phase: "start",
      screenPx: {
        x: 500,
        y: 300,
      },
    },
    {
      kind: "native-map-gesture-requested",
      gestureKind: "pan",
      phase: "move",
      screenPx: {
        x: 520,
        y: 310,
      },
    },
    {
      kind: "native-map-gesture-requested",
      gestureKind: "pan",
      phase: "end",
      screenPx: {
        x: 520,
        y: 310,
      },
    },
    {
      kind: "native-map-gesture-requested",
      gestureKind: "zoom",
      inputDelta: {
        y: -100,
      },
      anchorScreenPx: {
        x: 600,
        y: 320,
      },
    },
  ]) {
    await dispatchInteractionFact({
      trace,
      host,
      phase: `${fact.gestureKind}-${fact.phase ?? "instant"}`,
      fact,
      command: null,
      persists: false,
    });
  }

  assert.deepEqual(forwarded.map((fact) => `${fact.gestureKind}:${fact.phase ?? "instant"}`), [
    "pan:start",
    "pan:move",
    "pan:end",
    "zoom:instant",
  ]);
  assert.deepEqual(storage.writes, []);
});

// Class-b: a native-map pan is a bounded active gesture at the browser shell.
// If another input source reports wheel noise before the pan ends, the shell
// must not forward it as zoom and accidentally change map scale.
test("shell suppresses native-map zoom while pan is active", async () => {
  const trace = createOverlayShellTrace("shell suppresses native-map zoom while pan is active");
  const forwarded = [];
  const storage = createDurableStorageHarness({
    durableState: durableImageState({
      mode: "align",
      placement: placement(),
    }),
  });
  const host = createBrowserHostHarness({
    durableStatePort: storage.port,
    async forwardNativeMapGesture(fact) {
      forwarded.push(fact);
      trace.edge(flowEdge("callback.interaction-fact.native-map-gesture-requested", "port.forward-native-map-gesture", {
        phase: `${fact.gestureKind}-${fact.phase ?? "instant"}`,
        provider: "browser-shell",
      }));
      trace.edge(flowEdge("port.forward-native-map-gesture", "sink.native-map-gesture-forwarded", {
        phase: `${fact.gestureKind}-${fact.phase ?? "instant"}`,
        terminal: "port-result",
      }));
    },
  });

  await bootstrapBrowserExtension(host);
  await dispatchInteractionFact({
    trace,
    host,
    phase: "pan-start",
    fact: {
      kind: "native-map-gesture-requested",
      gestureKind: "pan",
      phase: "start",
      screenPx: {
        x: 500,
        y: 300,
      },
    },
  });
  await dispatchInteractionFact({
    trace,
    host,
    phase: "wheel-during-pan",
    fact: {
      kind: "native-map-gesture-requested",
      gestureKind: "zoom",
      inputDelta: {
        y: -100,
      },
      anchorScreenPx: {
        x: 500,
        y: 300,
      },
    },
    inert: "active-native-map-pan",
  });
  await dispatchInteractionFact({
    trace,
    host,
    phase: "pan-end",
    fact: {
      kind: "native-map-gesture-requested",
      gestureKind: "pan",
      phase: "end",
      screenPx: {
        x: 520,
        y: 310,
      },
    },
  });

  assert.deepEqual(forwarded.map((fact) => `${fact.gestureKind}:${fact.phase ?? "instant"}`), [
    "pan:start",
    "pan:end",
  ]);
  assert.deepEqual(storage.writes, []);
});

// Class-b: product transitions that remove overlay ownership must release an
// active native-map pan. Otherwise the page can be left with a stuck forwarded
// pointer sequence after mode switching or clearing the image.
test("shell ends active native-map pan when mode switch or clear image interrupts interaction", async () => {
  const trace = createOverlayShellTrace("shell ends active native-map pan when mode switch or clear image interrupts interaction");
  for (const [phase, command] of [
    ["mode-switch", {
      kind: "select-mode",
      mode: "trace",
    }],
    ["clear-image", {
      kind: "activate-primary-action",
    }],
  ]) {
    const forwarded = [];
    const storage = createDurableStorageHarness({
      durableState: durableImageState({
        mode: "align",
        placement: placement(),
      }),
    });
    const host = createBrowserHostHarness({
      durableStatePort: storage.port,
      async forwardNativeMapGesture(fact) {
        forwarded.push(fact);
        trace.edge(flowEdge("callback.interaction-fact.native-map-gesture-requested", "port.forward-native-map-gesture", {
          phase: `${phase}-${fact.phase}`,
          provider: "browser-shell",
        }));
        trace.edge(flowEdge("port.forward-native-map-gesture", "sink.native-map-gesture-forwarded", {
          phase: `${phase}-${fact.phase}`,
          terminal: "port-result",
        }));
      },
    });

    await bootstrapBrowserExtension(host);
    await host.dispatchInteractionFact({
      kind: "native-map-gesture-requested",
      gestureKind: "pan",
      phase: "start",
      screenPx: {
        x: 500,
        y: 300,
      },
    });
    await host.dispatchInteractionFact({
      kind: "native-map-gesture-requested",
      gestureKind: "pan",
      phase: "move",
      screenPx: {
        x: 520,
        y: 310,
      },
    });
    await trace.withSource(`source.rendered-command.${phase}`, () => host.latestRender.dispatchCommand(command));
    if (phase === "clear-image") {
      await trace.withSource(`source.rendered-command.${phase}-confirm`, () => host.latestRender.dispatchCommand(command));
    }

    assert.deepEqual(forwarded.map((fact) => ({
      gestureKind: fact.gestureKind,
      phase: fact.phase,
      screenPx: fact.screenPx,
    })), [
      {
        gestureKind: "pan",
        phase: "start",
        screenPx: {
          x: 500,
          y: 300,
        },
      },
      {
        gestureKind: "pan",
        phase: "move",
        screenPx: {
          x: 520,
          y: 310,
        },
      },
      {
        gestureKind: "pan",
        phase: "end",
        screenPx: {
          x: 520,
          y: 310,
        },
      },
    ]);
    trace.edge(flowEdge(`source.rendered-command.${phase}`, "port.forward-native-map-gesture", {
      phase: `${phase}-interrupt`,
      provider: "browser-shell",
    }));
    trace.edge(flowEdge("port.forward-native-map-gesture", "sink.native-map-gesture-forwarded", {
      phase: `${phase}-interrupt`,
      terminal: "port-result",
    }));
  }
});

async function dispatchInteractionFact({
  trace,
  host,
  fact,
  phase = undefined,
  command = undefined,
  persists = false,
  inert = undefined,
}) {
  const factNode = `callback.interaction-fact.${fact.kind}`;
  trace.edge(flowEdge("source.overlay-interaction", factNode, {
    ...phaseAttribute(phase),
    provider: "ui-input-adapter",
  }));
  await trace.withSource(factNode, () => host.dispatchInteractionFact(fact));
  if (command) {
    const commandNode = `command.${command}`;
    trace.edge(flowEdge(factNode, commandNode, {
      ...phaseAttribute(phase),
      provider: "interaction-runtime",
    }));
    trace.edge(flowEdge(commandNode, "sink.render", {
      ...phaseAttribute(phase),
      terminal: "render-result",
    }));
    if (persists) {
      trace.edge(flowEdge(commandNode, "effect.persist-durable-state", {
        ...phaseAttribute(phase),
        provider: "application-effect",
      }));
      trace.edge(flowEdge("effect.persist-durable-state", "port.durable-state.write", {
        ...phaseAttribute(phase),
        provider: "browser-shell",
      }));
      trace.edge(flowEdge("port.durable-state.write", "sink.durable-state.write", {
        ...phaseAttribute(phase),
        terminal: "storage-write",
      }));
    }
    return;
  }
  if (inert) {
    trace.edge(flowEdge(factNode, `inert.${inert}`, {
      ...phaseAttribute(phase),
      terminal: "intentionally-inert",
    }));
  }
}

function phaseAttribute(phase) {
  return phase === undefined ? {} : { phase };
}

function createOverlayShellTrace(testName) {
  return createFlowTrace({
    file: import.meta.url,
    test: testName,
  });
}

function createBrowserHostHarness({
  durableStatePort,
  projectPlacementEdit = undefined,
  selectOpacity = undefined,
  projectRegistrationPinToggle = undefined,
  forwardNativeMapGesture = undefined,
}) {
  const reportedErrors = [];
  return {
    pageContext: {
      kind: "supported-map-editor-page",
    },
    durableStatePort,
    projectPlacementEdit,
    selectOpacity,
    projectRegistrationPinToggle,
    forwardNativeMapGesture,
    reportedErrors,
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
    reportRuntimeError(error) {
      reportedErrors.push(error);
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

function durableImageState({
  mode,
  placement: placementData = undefined,
  opacity = undefined,
  pins = undefined,
} = {}) {
  const session = {
    mode,
    referenceImage: normalizedReferenceImage(),
  };
  if (placementData !== undefined) {
    session.placement = placementData;
  }
  if (opacity !== undefined) {
    session.opacity = opacity;
  }
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

function placement({
  x = 20,
  y = 10,
  scale = 1,
  rotationRad = 0,
} = {}) {
  return {
    x,
    y,
    scale,
    rotationRad,
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
