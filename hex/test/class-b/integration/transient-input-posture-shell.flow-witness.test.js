import test from "node:test";
import assert from "node:assert/strict";

import {
  bootstrapBrowserExtension,
} from "../../../bootstrap/index.js";
import {
  createFlowTrace,
  flowEdge,
} from "../../support/flow-trace.js";

// Class-b: this names today's shell seam, not the final browser lifecycle
// controller. The stable boundary is that source-neutral interaction facts can
// enter the app, re-render visible posture, and leave durable storage untouched.
test("temporary native-map access changes visible interaction posture without durability", async () => {
  const trace = createTransientShellTrace("temporary native-map access changes visible interaction posture without durability");
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
    pointerAffordances: {
      default: "native-map-pan",
      shift: "move-overlay",
      ctrl: "scale-overlay",
      alt: "rotate-overlay",
    },
  });

  await host.dispatchInteractionFact({
    kind: "temporary-native-map-access-started",
  });
  assert.equal(host.latestRender.view.mode, "align");
  assert.deepEqual(host.latestRender.view.overlayInput, {
    kind: "native-map",
    canEditOverlay: false,
    arePinsVisible: false,
    pointerAffordances: {
      default: "native-map-pass-through",
    },
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
    pointerAffordances: {
      default: "native-map-pan",
      shift: "move-overlay",
      ctrl: "scale-overlay",
      alt: "rotate-overlay",
    },
  });
  assert.deepEqual(storage.writes, []);
  traceInteractionFact(trace, "temporary-access-start", "set-temporary-input-posture", false);
  traceInteractionFact(trace, "temporary-access-end", "set-temporary-input-posture", false);
});

// Class-b: mode changes and image removal are product transitions that end
// temporary native-map access. The visible interaction posture must not remain
// stuck in pass-through after those commands.
test("mode switch and clear image clear temporary native-map access", async () => {
  const trace = createTransientShellTrace("mode switch and clear image clear temporary native-map access");
  for (const [phase, command, expectedSession] of [
    ["mode-switch", {
      kind: "select-mode",
      mode: "trace",
    }, true],
    ["clear-image", {
      kind: "activate-primary-action",
    }, false],
  ]) {
    const storage = createDurableStorageHarness({
      durableState: durableImageState({
        mode: "align",
        pins: phase === "clear-image" ? undefined : [firstPin()],
      }),
    });
    const host = createBrowserHostHarness({
      durableStatePort: storage.port,
    });

    const result = await bootstrapBrowserExtension(host);
    await host.dispatchInteractionFact({
      kind: "temporary-native-map-access-started",
    });
    assert.deepEqual(result.runtime.getState().inputOverride, {
      kind: "temporary-native-map-access",
    });

    await host.latestRender.dispatchCommand(command);
    if (phase === "clear-image") {
      await host.latestRender.dispatchCommand(command);
    }

    assert.equal(result.runtime.getState().inputOverride, undefined);
    assert.equal(Boolean(result.runtime.getState().session), expectedSession);
    traceInteractionFact(trace, `${phase}-temporary-access-start`, "set-temporary-input-posture", false);
    trace.edge(flowEdge("source.rendered-command", `command.${command.kind}`, {
      phase,
      provider: "rendered-ui",
    }));
    trace.edge(flowEdge(`command.${command.kind}`, "sink.render", {
      phase,
      terminal: "render-result",
    }));
  }
});

// Class-b: keyboard and pointer adapters emit the same source-neutral
// registration-pin fact. The shell boundary is that the fact is projected once,
// enters the app as a semantic pin toggle, re-renders, and persists.
test("registration pin interaction fact projects to a durable visible pin", async () => {
  const trace = createTransientShellTrace("registration pin interaction fact projects to a durable visible pin");
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
  assert.deepEqual(host.latestRender.view.overlay.pins, [{
    ...firstPin(),
    label: "1",
  }]);
  assert.deepEqual(storage.writes, [durableImageState({
    mode: "align",
    pins: [firstPin()],
  })]);
  traceInteractionFact(trace, "registration-pin-toggle", "toggle-registration-pin", true);
});

function createTransientShellTrace(testName) {
  return createFlowTrace({
    file: import.meta.url,
    test: testName,
  });
}

function traceInteractionFact(trace, phase, command, persists) {
  const commandNode = `command.${command}`;
  trace.edge(flowEdge("source.interaction-fact", commandNode, {
    phase,
    provider: "browser-shell",
  }));
  trace.edge(flowEdge(commandNode, "sink.render", {
    phase,
    terminal: "render-result",
  }));
  if (!persists) {
    return;
  }
  trace.edge(flowEdge(commandNode, "effect.persist-durable-state", {
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
