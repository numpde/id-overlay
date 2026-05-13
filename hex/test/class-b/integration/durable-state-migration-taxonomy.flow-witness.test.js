import test from "node:test";
import assert from "node:assert/strict";

import {
  bootstrapBrowserExtension,
} from "../../../bootstrap/index.js";
import {
  createFlowTrace,
  flowEdge,
} from "../../support/flow-trace.js";

// Class-b, deliberately not class-a: exact migration policy may change, but the
// browser-shell boundary is stable. Unsupported stored product shapes must be
// quarantined and cleared as one startup recovery path, including nested fields
// that are not currently visible in the panel.
test("unsupported durable-state variants all recover to empty startup state", async (t) => {
  for (const { name, durableState } of unsupportedDurableStates()) {
    await t.test(name, async () => {
      const trace = createFlowTrace({
        file: import.meta.url,
        test: `unsupported durable-state variants all recover to empty startup state: ${name}`,
      });
      const storage = createDurableStorageHarness({
        trace,
        durableState,
        writeSource: "callback.startup-durable-state",
        writeProvider: "browser-shell-recovery",
      });
      const host = createBrowserHostHarness({
        trace,
        durableStatePort: storage.port,
      });

      const result = await startBrowserShell({ trace, host });

      assert.deepEqual(result.runtime.getState(), {});
      assert.deepEqual(storage.writes, [null]);
      assert.equal(host.latestRender.view.overlay.visible, false);
      assert.deepEqual(host.reportedErrors, []);
      assert.deepEqual(trace.edges, [
        ...startupDurableReadEdges(),
        flowEdge("callback.startup-durable-state", "command.hydrate", {
          provider: "browser-shell-harness",
        }),
        flowEdge("command.hydrate", "sink.application-boundary-error", {
          terminal: "boundary-error",
        }),
        ...durableWriteEdges({
          from: "callback.startup-durable-state",
          provider: "browser-shell-recovery",
        }),
        renderEdge(),
      ]);
    });
  }
});

// Class-b: old releases persisted map-centered placement records. Those are
// recoverable only with live page context; they must not be treated as the same
// corrupt-placement bucket as arbitrary malformed durable state.
test("legacy map-centered placement migrates through a live page snapshot", async () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "legacy map-centered placement migrates through a live page snapshot",
  });
  const referenceImage = normalizedReferenceImage();
  const legacyPlacement = legacyMapCenteredPlacement();
  const liveMapSnapshot = supportedMapSnapshot();
  const canonicalPlacement = placement({
    x: 372,
    y: 272,
    scale: 1.25,
    rotationRad: 0.5,
  });
  const storage = createDurableStorageHarness({
    trace,
    durableState: legacyDurableImageState({
      referenceImage,
      placement: legacyPlacement,
    }),
    writeSource: "callback.live-map-snapshot",
    writeProvider: "browser-shell-migration",
  });
  const migration = createLegacyPlacementMigrationHarness({
    trace,
    placement: canonicalPlacement,
  });
  const host = createBrowserHostHarness({
    trace,
    durableStatePort: storage.port,
    pageSnapshotPort: createPageSnapshotHarness({
      trace,
      snapshot: liveMapSnapshot,
    }),
    legacyPlacementMigrationPort: migration.port,
  });

  const result = await startBrowserShell({ trace, host });

  assert.deepEqual(migration.calls, [{
    referenceImage,
    legacyPlacement,
    pageSnapshot: liveMapSnapshot,
  }]);
  assert.deepEqual(result.runtime.getState(), currentDurableImageState({
    referenceImage,
    placement: canonicalPlacement,
    opacity: 0.5,
  }));
  assert.deepEqual(storage.writes, [currentDurableImageState({
    referenceImage,
    placement: canonicalPlacement,
    opacity: 0.5,
  })]);
  assert.deepEqual(host.reportedErrors, []);
  assert.deepEqual(trace.edges, [
    ...startupDurableReadEdges(),
    ...pageSnapshotEdges(),
    ...legacyPlacementMigrationEdges(),
    ...durableWriteEdges({
      from: "callback.live-map-snapshot",
      provider: "browser-shell-migration",
    }),
    renderEdge(),
  ]);
});

// Class-b: if page context is not usable yet, the shell should keep the image
// recoverable instead of clearing the whole durable record or guessing a
// placement. A later page-observation lifecycle can reconcile it.
test("unresolved legacy map-centered placement keeps the image session", async () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "unresolved legacy map-centered placement keeps the image session",
  });
  const referenceImage = normalizedReferenceImage();
  const storage = createDurableStorageHarness({
    trace,
    durableState: legacyDurableImageState({
      referenceImage,
      placement: legacyMapCenteredPlacement(),
    }),
  });
  const migration = createLegacyPlacementMigrationHarness({
    trace,
    placement: placement(),
  });
  const host = createBrowserHostHarness({
    trace,
    durableStatePort: storage.port,
    pageSnapshotPort: createPageSnapshotHarness({
      trace,
      snapshot: {
        kind: "unavailable-map-snapshot",
        reason: "missing-map-view",
      },
    }),
    legacyPlacementMigrationPort: migration.port,
  });

  const result = await startBrowserShell({ trace, host });

  assert.deepEqual(migration.calls, []);
  assert.deepEqual(result.runtime.getState(), currentDurableImageState({
    referenceImage,
    opacity: 0.5,
  }));
  assert.deepEqual(storage.writes, []);
  assert.deepEqual(host.reportedErrors, []);
  assert.deepEqual(trace.edges, [
    ...startupDurableReadEdges(),
    ...pageSnapshotEdges(),
    flowEdge("callback.live-map-snapshot", "inert.legacy-placement-migration", {
      terminal: "intentionally-inert",
    }),
    renderEdge(),
  ]);
});

function unsupportedDurableStates() {
  const referenceImage = normalizedReferenceImage();
  return [
    {
      name: "extra top-level field",
      durableState: {
        ...durableImageState({ referenceImage }),
        staleLegacyRoot: true,
      },
    },
    {
      name: "invalid image dimensions",
      durableState: durableImageState({
        referenceImage: {
          ...referenceImage,
          intrinsicSizePx: {
            width: 0,
            height: 480,
          },
        },
      }),
    },
    {
      name: "invalid placement shape",
      durableState: durableImageState({
        referenceImage,
        placement: placement({
          scale: 0,
        }),
      }),
    },
    {
      name: "invalid opacity",
      durableState: durableImageState({
        referenceImage,
        opacity: 1.5,
      }),
    },
    {
      name: "invalid registration pin shape",
      durableState: {
        session: {
          mode: "align",
          referenceImage,
          registration: {
            pins: [{
              id: "legacy-string-id",
              imagePx: {
                x: 10,
                y: 20,
              },
            }],
          },
        },
      },
    },
  ];
}

function createBrowserHostHarness({
  trace,
  durableStatePort,
  pageSnapshotPort = undefined,
  legacyPlacementMigrationPort = undefined,
}) {
  const reportedErrors = [];
  return {
    pageContext: {
      kind: "supported-map-editor-page",
    },
    durableStatePort,
    pageSnapshotPort,
    legacyPlacementMigrationPort,
    latestRender: null,
    mountOwnedRoot(ownerId, root) {
      return {
        ...root,
        ownerId,
      };
    },
    renderApplicationView(render) {
      trace.edge(renderEdge());
      this.latestRender = render;
    },
    reportRuntimeError(error) {
      reportedErrors.push(error);
    },
    reportedErrors,
    startRuntime(runtime) {
      return runtime;
    },
  };
}

async function startBrowserShell({ trace, host }) {
  return trace.withSource("source.bootstrap-browser-extension", () => (
    bootstrapBrowserExtension(host)
  ));
}

function createPageSnapshotHarness({ trace, snapshot }) {
  return {
    readSnapshot() {
      trace.edge(flowEdge("callback.startup-durable-state", "port.page-snapshot.read", {
        provider: "browser-shell-migration",
      }));
      trace.edge(flowEdge("port.page-snapshot.read", "sink.map-snapshot", {
        terminal: "port-result",
      }));
      trace.edge(flowEdge("port.page-snapshot.read", "callback.live-map-snapshot", {
        provider: "browser-shell-migration",
      }));
      if (snapshot.kind !== "supported-map-page") {
        trace.edge(flowEdge("callback.live-map-snapshot", "inert.legacy-placement-migration", {
          terminal: "intentionally-inert",
        }));
      }
      return snapshot;
    },
  };
}

function createLegacyPlacementMigrationHarness({ trace, placement: nextPlacement }) {
  const calls = [];
  return {
    calls,
    port: {
      reconcileLegacyPlacement({ referenceImage, legacyPlacement, pageSnapshot }) {
        trace.edge(flowEdge("callback.live-map-snapshot", "port.legacy-placement-migration", {
          provider: "browser-shell-migration",
        }));
        calls.push({
          referenceImage,
          legacyPlacement,
          pageSnapshot,
        });
        trace.edge(flowEdge("port.legacy-placement-migration", "sink.legacy-placement-migration", {
          terminal: "port-result",
        }));
        return nextPlacement;
      },
    },
  };
}

function createDurableStorageHarness({
  trace,
  durableState,
  writeSource = "effect.persist-durable-state",
  writeProvider = "browser-shell-effect-handler",
}) {
  const writes = [];
  return {
    writes,
    port: {
      async readDurableState() {
        trace.edge(flowEdge("source.bootstrap-browser-extension", "port.durable-state.read", {
          provider: "browser-shell-harness",
        }));
        trace.edge(flowEdge("port.durable-state.read", "sink.startup-durable-state", {
          terminal: "port-result",
        }));
        trace.edge(flowEdge("port.durable-state.read", "callback.startup-durable-state", {
          provider: "browser-shell-harness",
        }));
        if (!isLegacyMapCenteredPlace(durableState?.session?.placement)) {
          trace.edge(flowEdge("callback.startup-durable-state", "command.hydrate", {
            provider: "browser-shell-harness",
          }));
        }
        return durableState;
      },
      async writeDurableState(nextDurableState) {
        if (writeSource === "callback.startup-durable-state") {
          trace.edge(flowEdge("command.hydrate", "sink.application-boundary-error", {
            terminal: "boundary-error",
          }));
        }
        trace.edge(flowEdge(writeSource, "port.durable-state.write", {
          provider: writeProvider,
        }));
        writes.push(nextDurableState);
        trace.edge(flowEdge("port.durable-state.write", "sink.durable-state.write", {
          terminal: "durable-write",
        }));
      },
    },
  };
}

function isLegacyMapCenteredPlace(value) {
  return Boolean(value?.centerMapLatLon);
}

function startupDurableReadEdges() {
  return [
    flowEdge("source.bootstrap-browser-extension", "port.durable-state.read", {
      provider: "browser-shell-harness",
    }),
    flowEdge("port.durable-state.read", "sink.startup-durable-state", {
      terminal: "port-result",
    }),
    flowEdge("port.durable-state.read", "callback.startup-durable-state", {
      provider: "browser-shell-harness",
    }),
  ];
}

function pageSnapshotEdges() {
  return [
    flowEdge("callback.startup-durable-state", "port.page-snapshot.read", {
      provider: "browser-shell-migration",
    }),
    flowEdge("port.page-snapshot.read", "sink.map-snapshot", {
      terminal: "port-result",
    }),
    flowEdge("port.page-snapshot.read", "callback.live-map-snapshot", {
      provider: "browser-shell-migration",
    }),
  ];
}

function legacyPlacementMigrationEdges() {
  return [
    flowEdge("callback.live-map-snapshot", "port.legacy-placement-migration", {
      provider: "browser-shell-migration",
    }),
    flowEdge("port.legacy-placement-migration", "sink.legacy-placement-migration", {
      terminal: "port-result",
    }),
  ];
}

function durableWriteEdges({ from, provider }) {
  return [
    flowEdge(from, "port.durable-state.write", {
      provider,
    }),
    flowEdge("port.durable-state.write", "sink.durable-state.write", {
      terminal: "durable-write",
    }),
  ];
}

function renderEdge() {
  return flowEdge("source.bootstrap-browser-extension", "sink.render", {
    terminal: "view-result",
  });
}

function legacyDurableImageState({
  referenceImage,
  placement: placementData,
}) {
  return currentDurableImageState({
    referenceImage,
    placement: placementData,
    opacity: 0.5,
  });
}

function currentDurableImageState({
  referenceImage,
  placement: placementData = undefined,
  opacity = undefined,
}) {
  return durableImageState({
    referenceImage,
    placement: placementData,
    opacity,
  });
}

function durableImageState({
  referenceImage,
  placement: placementData = undefined,
  opacity = undefined,
}) {
  const session = {
    mode: "align",
    referenceImage,
  };
  if (placementData !== undefined) {
    session.placement = placementData;
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

function placement({
  x = 80,
  y = 40,
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

function legacyMapCenteredPlacement() {
  return {
    centerMapLatLon: {
      lat: 0,
      lon: 0,
    },
    scale: 1.25,
    rotationRad: 0.5,
  };
}

function supportedMapSnapshot() {
  return {
    kind: "supported-map-page",
    mapView: {
      zoom: 17,
      centerLatLon: {
        lat: -1.24401,
        lon: 36.82412,
      },
    },
    viewportPx: {
      width: 1280,
      height: 720,
    },
    tileTransform: {
      x: -240,
      y: -180,
      scale: 1,
    },
  };
}
