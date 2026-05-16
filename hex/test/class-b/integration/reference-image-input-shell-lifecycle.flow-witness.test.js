import test from "node:test";
import assert from "node:assert/strict";

import {
  createReferenceImageInputPortAdapter,
} from "../../../adapters/web/reference-image-input-port.js";
import {
  bootstrapBrowserExtension,
} from "../../../bootstrap/index.js";
import {
  createFlowTrace,
  flowEdge,
} from "../../support/flow-trace.js";

const REFERENCE_IMAGE_INPUT_PROVIDER_OBLIGATION = "reference-image-input-provider";

// Class-b: this is the stable shell boundary, but still tested with a bootstrap
// harness rather than a real browser adapter. The application owns semantic
// request correlation; bootstrap merely routes the effect through one input
// port. Clipboard, manual paste, file input, and drag/drop remain tactics behind
// that port, not separate product paths in bootstrap.
test("browser shell starts reference-image input and reports accepted outcome", async () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "browser shell starts reference-image input and reports accepted outcome",
  });
  const referenceImage = normalizedReferenceImage();
  const storage = createDurableStorageHarness({
    trace,
    durableState: null,
  });
  const input = createReferenceImageInputHarness({ trace });
  const host = createBrowserHostHarness({
    trace,
    durableStatePort: storage.port,
    referenceImageInputPort: input.port,
  });

  const result = await startBrowserShell({ trace, host });
  await dispatchRenderedCommand({
    trace,
    phase: "start-input",
    dispatchCommand: host.latestRender.dispatchCommand,
    command: {
      kind: "activate-primary-action",
    },
  });

  assert.deepEqual(input.starts, [{
    requestId: 1,
    intent: {
      kind: "load-reference-image",
    },
  }]);

  await input.reportOutcome(1, {
    kind: "accepted",
    referenceImage,
  });

  assert.deepEqual(result.runtime.getState(), {
    session: {
      mode: "align",
      referenceImage,
    },
    notice: loadedReferenceImageNotice(referenceImage),
  });
  assert.deepEqual(storage.writes, [{
    session: {
      mode: "align",
      referenceImage,
    },
  }]);
  assert.deepEqual(referenceInputEdges(trace), [
    flowEdge("effect.request-reference-image-input", "port.reference-image-input.start", {
      phase: "start-input",
      surface: "shell-harness",
      provider: "browser-shell-effect-handler",
    }),
    flowEdge("port.reference-image-input.start", "callback.reference-image-input.outcome", {
      phase: "start-input",
      surface: "shell-harness",
      obligation: REFERENCE_IMAGE_INPUT_PROVIDER_OBLIGATION,
      provider: "reference-image-input-harness",
    }),
    flowEdge("source.reference-image-input.outcome", "callback.reference-image-input.outcome", {
      surface: "shell-harness",
      provider: "reference-image-input-harness",
    }),
    flowEdge("callback.reference-image-input.outcome", "command.report-reference-image-input-outcome", {
      surface: "shell-harness",
      provider: "reference-image-input-harness",
    }),
    flowEdge("callback.reference-image-input.outcome", "sink.render", {
      terminal: "view-result",
    }),
  ]);
});

// Class-b: reference-image input decodes the image, but the browser shell owns
// first placement because only the shell can observe the live map page. A live
// snapshot may author an initial placement; non-live snapshots must not.
test("browser shell authors initial reference-image placement from a live map snapshot", async () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "browser shell authors initial reference-image placement from a live map snapshot",
  });
  const referenceImage = normalizedReferenceImage();
  const initialPlacement = placement();
  const storage = createDurableStorageHarness({
    trace,
    durableState: null,
  });
  const input = createReferenceImageInputHarness({ trace });
  const pageSnapshot = createPageSnapshotHarness({
    trace,
    snapshot: liveMapSnapshot(),
  });
  const initialPlacementPort = createInitialReferencePlacementHarness({
    trace,
    placement: initialPlacement,
  });
  const host = createBrowserHostHarness({
    trace,
    durableStatePort: storage.port,
    referenceImageInputPort: input.port,
    pageSnapshotPort: pageSnapshot.port,
    initialReferencePlacementPort: initialPlacementPort.port,
  });

  const result = await startBrowserShell({ trace, host });
  await dispatchRenderedCommand({
    trace,
    phase: "start-input",
    dispatchCommand: host.latestRender.dispatchCommand,
    command: {
      kind: "activate-primary-action",
    },
  });
  await input.reportOutcome(1, {
    kind: "accepted",
    referenceImage,
  });

  assert.deepEqual(pageSnapshot.reads, [liveMapSnapshot()]);
  assert.deepEqual(initialPlacementPort.requests, [{
    referenceImage,
    pageSnapshot: liveMapSnapshot(),
  }]);
  assert.deepEqual(result.runtime.getState(), {
    session: {
      mode: "align",
      referenceImage,
      placement: initialPlacement,
    },
    notice: loadedReferenceImageNotice(referenceImage),
  });
  assert.deepEqual(storage.writes.at(-1), {
    session: {
      mode: "align",
      referenceImage,
      placement: initialPlacement,
    },
  });
});

test("browser shell refuses initial reference-image placement without a map snapshot", async () => {
  await assertRefusesInitialPlacementFromSnapshot({
    testName: "browser shell refuses initial reference-image placement without a map snapshot",
    snapshot: {
      kind: "unavailable-map-snapshot",
      reason: "missing-map-view",
    },
  });
});

test("browser shell refuses initial reference-image placement from a retained map snapshot", async () => {
  await assertRefusesInitialPlacementFromSnapshot({
    testName: "browser shell refuses initial reference-image placement from a retained map snapshot",
    snapshot: {
      kind: "supported-map-page",
      mapView: {
        zoom: 16,
        centerLatLon: {
          lat: -1.23,
          lon: 36.84,
        },
      },
      viewportPx: {
        width: 900,
        height: 600,
      },
      provenance: {
        mapView: {
          kind: "retained-during-surface-motion",
        },
      },
    },
  });
});

// Class-b: cancellation has two owners. The app owns the product fact that the
// request ended; the shell owns host-resource cleanup for the matching request.
// The request id is the only coupling allowed between those two responsibilities.
test("browser shell cancels reference-image input and late outcomes stay inert", async () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "browser shell cancels reference-image input and late outcomes stay inert",
  });
  const storage = createDurableStorageHarness({
    trace,
    durableState: null,
  });
  const input = createReferenceImageInputHarness({ trace });
  const host = createBrowserHostHarness({
    trace,
    durableStatePort: storage.port,
    referenceImageInputPort: input.port,
  });

  const result = await startBrowserShell({ trace, host });
  await dispatchRenderedCommand({
    trace,
    phase: "start-input",
    dispatchCommand: host.latestRender.dispatchCommand,
    command: {
      kind: "activate-primary-action",
    },
  });
  await dispatchRenderedCommand({
    trace,
    phase: "cancel-input",
    dispatchCommand: host.latestRender.dispatchCommand,
    command: {
      kind: "activate-primary-action",
    },
  });

  assert.deepEqual(input.cancellations, [{
    requestId: 1,
  }]);

  await input.reportOutcome(1, {
    kind: "accepted",
    referenceImage: normalizedReferenceImage(),
  });

  assert.deepEqual(result.runtime.getState(), {
    notice: {
      kind: "reference-image-input-cancelled",
      requestId: 1,
    },
  });
  assert.deepEqual(storage.writes, []);
  assert.deepEqual(referenceInputEdges(trace), [
    flowEdge("effect.request-reference-image-input", "port.reference-image-input.start", {
      phase: "start-input",
      surface: "shell-harness",
      provider: "browser-shell-effect-handler",
    }),
    flowEdge("port.reference-image-input.start", "callback.reference-image-input.outcome", {
      phase: "start-input",
      surface: "shell-harness",
      obligation: REFERENCE_IMAGE_INPUT_PROVIDER_OBLIGATION,
      provider: "reference-image-input-harness",
    }),
    flowEdge("effect.cancel-reference-image-input", "port.reference-image-input.cancel", {
      phase: "cancel-input",
      surface: "shell-harness",
      provider: "browser-shell-effect-handler",
    }),
    flowEdge("port.reference-image-input.cancel", "sink.reference-image-input.cancel", {
      phase: "cancel-input",
      surface: "shell-harness",
      terminal: "host-resource-disposed",
    }),
    flowEdge("source.reference-image-input.outcome", "callback.reference-image-input.outcome", {
      surface: "shell-harness",
      provider: "reference-image-input-harness",
    }),
    flowEdge("callback.reference-image-input.outcome", "command.report-reference-image-input-outcome", {
      surface: "shell-harness",
      provider: "reference-image-input-harness",
    }),
    flowEdge("callback.reference-image-input.outcome", "sink.render", {
      terminal: "view-result",
    }),
  ]);
});

// Class-b: this is the stronger composition witness for the paste route. It
// keeps the app/shell boundary intact while using the real reference-image
// input adapter, so the emitted graph includes the active browser listener
// resource rather than a harnessed immediate outcome.
test("browser shell composes reference-image input through manual paste", async () => {
  const testName = "browser shell composes reference-image input through manual paste";
  const trace = createFlowTrace({
    file: import.meta.url,
    test: testName,
  });
  const caseId = "composed-manual-paste";
  const request = requestIdentity(1);
  const resource = pasteListenerResourceIdentity(1);
  const referenceImage = normalizedReferenceImage();
  const storage = createDurableStorageHarness({
    trace,
    durableState: null,
  });
  const paste = createPasteListenerHarness();
  const input = createComposedReferenceImageInputPort({
    trace,
    caseId,
    request,
    resource,
    referenceImage,
    paste,
  });
  const host = createBrowserHostHarness({
    trace,
    durableStatePort: storage.port,
    referenceImageInputPort: input,
  });

  const result = await startBrowserShell({ trace, host });
  await dispatchRenderedCommand({
    trace,
    caseId,
    phase: "start-input",
    request,
    surface: "composed-browser-shell",
    dispatchCommand: host.latestRender.dispatchCommand,
    command: {
      kind: "activate-primary-action",
    },
  });

  assert.equal(paste.isActive, true);

  const pasteEvent = createPasteEvent({
    imageHandle: {
      runtimeHandle: "manual-image",
    },
  });
  await paste.dispatch(pasteEvent, {
    trace,
    caseId,
    phase: "manual-paste",
    request,
    resource,
  });

  assert.equal(pasteEvent.defaultPrevented, true);
  assert.equal(paste.isActive, false);
  assert.deepEqual(result.runtime.getState(), {
    session: {
      mode: "align",
      referenceImage,
    },
    notice: loadedReferenceImageNotice(referenceImage),
  });
  assert.deepEqual(storage.writes, [{
    session: {
      mode: "align",
      referenceImage,
    },
  }]);
  assert.deepEqual(caseEdges(trace, caseId), [
    flowEdge("source.rendered-command.activate-primary-action", "command.activate-primary-action", flowAttrs({
      caseId,
      phase: "start-input",
      request,
      surface: "composed-browser-shell",
      provider: "browser-shell-harness",
    })),
    flowEdge("command.activate-primary-action", "effect.request-reference-image-input", flowAttrs({
      caseId,
      phase: "start-input",
      request,
      surface: "composed-browser-shell",
      provider: "application",
    })),
    flowEdge("effect.request-reference-image-input", "port.reference-image-input.start", flowAttrs({
      caseId,
      phase: "start-input",
      request,
      surface: "composed-browser-shell",
      provider: "browser-shell-effect-handler",
    })),
    flowEdge("port.reference-image-input.start", "callback.reference-image-input.started", flowAttrs({
      caseId,
      phase: "start-input",
      request,
      surface: "composed-browser-shell",
      fulfills: REFERENCE_IMAGE_INPUT_PROVIDER_OBLIGATION,
      provider: "reference-image-input-port",
    })),
    flowEdge("callback.reference-image-input.started", "port.clipboard-image.read", flowAttrs({
      caseId,
      phase: "direct-unavailable",
      request,
      surface: "composed-browser-shell",
      provider: "reference-image-input-port",
    })),
    flowEdge("port.clipboard-image.read", "callback.image-source-result", flowAttrs({
      caseId,
      phase: "direct-unavailable",
      request,
      surface: "composed-browser-shell",
      provider: "reference-image-input-port",
    })),
    flowEdge("callback.image-source-result", "port.paste-listener.add", flowAttrs({
      caseId,
      phase: "direct-unavailable",
      request,
      surface: "composed-browser-shell",
      provider: "reference-image-input-port",
    })),
    flowEdge("port.paste-listener.add", "resource.paste-listener.active", flowAttrs({
      caseId,
      phase: "direct-unavailable",
      request,
      resource,
      surface: "composed-browser-shell",
      provider: "reference-image-input-port",
    })),
    flowEdge("source.rendered-command.activate-primary-action", "sink.render", flowAttrs({
      caseId,
      phase: "start-input",
      request,
      surface: "composed-browser-shell",
      terminal: "view-result",
    })),
    flowEdge("source.manual-paste-event", "resource.paste-listener.active", flowAttrs({
      caseId,
      phase: "manual-paste",
      request,
      resource,
      surface: "browser-event-loop",
      provider: "browser-event-loop",
    })),
    flowEdge("resource.paste-listener.active", "callback.paste-event", flowAttrs({
      caseId,
      phase: "manual-paste",
      request,
      resource,
      surface: "composed-browser-shell",
      provider: "reference-image-input-port",
    })),
    flowEdge("callback.paste-event", "port.paste-event-image.read", flowAttrs({
      caseId,
      phase: "manual-paste",
      request,
      surface: "composed-browser-shell",
      provider: "reference-image-input-port",
    })),
    flowEdge("port.paste-event-image.read", "callback.image-source-result", flowAttrs({
      caseId,
      phase: "manual-paste",
      request,
      surface: "composed-browser-shell",
      provider: "reference-image-input-port",
    })),
    flowEdge("callback.image-source-result", "port.image-normalization.normalize", flowAttrs({
      caseId,
      phase: "manual-paste",
      request,
      surface: "composed-browser-shell",
      provider: "reference-image-input-port",
    })),
    flowEdge("resource.paste-listener.active", "sink.paste-listener.disposed", flowAttrs({
      caseId,
      phase: "direct-unavailable",
      request,
      resource,
      surface: "composed-browser-shell",
      terminal: "host-resource-disposed",
    })),
    flowEdge("port.image-normalization.normalize", "callback.reference-image-input.outcome", flowAttrs({
      caseId,
      phase: "manual-paste",
      request,
      surface: "composed-browser-shell",
      provider: "reference-image-input-port",
    })),
    flowEdge("callback.reference-image-input.outcome", "command.report-reference-image-input-outcome", flowAttrs({
      caseId,
      phase: "manual-paste",
      request,
      surface: "composed-browser-shell",
      provider: "browser-shell-effect-handler",
    })),
    flowEdge("command.report-reference-image-input-outcome", "effect.persist-durable-state", flowAttrs({
      caseId,
      phase: "accepted-outcome",
      request,
      surface: "composed-browser-shell",
      provider: "application",
    })),
    flowEdge("effect.persist-durable-state", "port.durable-state.write", flowAttrs({
      caseId,
      phase: "accepted-outcome",
      request,
      surface: "composed-browser-shell",
      provider: "browser-shell-effect-handler",
    })),
    flowEdge("port.durable-state.write", "sink.durable-state.write", flowAttrs({
      caseId,
      phase: "accepted-outcome",
      request,
      surface: "composed-browser-shell",
      terminal: "durable-write",
    })),
    flowEdge("command.report-reference-image-input-outcome", "sink.render", flowAttrs({
      caseId,
      phase: "accepted-outcome",
      request,
      surface: "composed-browser-shell",
      terminal: "view-result",
    })),
    flowEdge("callback.paste-event", "sink.paste-event.default-prevented", flowAttrs({
      caseId,
      phase: "manual-paste",
      request,
      surface: "composed-browser-shell",
      terminal: "browser-event-consumed",
    })),
  ]);
});

async function startBrowserShell({ trace, host }) {
  return trace.withSource("source.bootstrap-browser-extension", () => (
    bootstrapBrowserExtension(host)
  ));
}

async function dispatchRenderedCommand({
  trace,
  dispatchCommand,
  command,
  caseId = undefined,
  phase = undefined,
  request = undefined,
  surface = undefined,
}) {
  const source = `source.rendered-command.${command.kind}`;
  const attributes = flowAttrs({
    caseId,
    phase,
    request,
    surface,
  });
  trace.edge(flowEdge(source, `command.${command.kind}`, {
    ...attributes,
    provider: "browser-shell-harness",
  }));
  await trace.withAttributes(attributes, () => (
    trace.withSource(source, () => dispatchCommand(command))
  ));
}

function referenceInputEdges(trace) {
  return trace.edges.filter((edge) => (
    edge.from.startsWith("effect.request-reference-image-input")
      || edge.from.startsWith("effect.cancel-reference-image-input")
      || edge.from.startsWith("port.reference-image-input.")
      || edge.from.startsWith("source.reference-image-input.")
      || edge.from.startsWith("callback.reference-image-input.")
  ));
}

function createBrowserHostHarness({
  trace,
  durableStatePort,
  referenceImageInputPort,
  pageSnapshotPort = undefined,
  initialReferencePlacementPort = undefined,
}) {
  return {
    pageContext: {
      kind: "supported-map-editor-page",
    },
    durableStatePort,
    referenceImageInputPort,
    pageSnapshotPort,
    initialReferencePlacementPort,
    latestRender: null,
    mountOwnedRoot(ownerId, root) {
      return {
        ...root,
        ownerId,
      };
    },
    renderApplicationView(render) {
      trace.edge(flowEdge(trace.activeSource() ?? "source.browser-shell-render", "sink.render", {
        ...trace.activeAttributes(),
        terminal: "view-result",
      }));
      this.latestRender = render;
    },
    startRuntime(runtime) {
      return runtime;
    },
  };
}

function createPageSnapshotHarness({
  trace,
  snapshot,
  phase = "initial-placement",
}) {
  const reads = [];
  return {
    reads,
    port: {
      readSnapshot() {
        reads.push(snapshot);
        trace.edge(flowEdge("callback.reference-image-input.outcome", "port.page-snapshot.read", flowAttrs({
          phase,
          surface: "shell-harness",
          provider: "browser-shell-effect-handler",
        })));
        trace.edge(flowEdge("port.page-snapshot.read", "sink.map-snapshot", flowAttrs({
          phase,
          terminal: "port-result",
        })));
        if (isLiveMapSnapshot(snapshot)) {
          trace.edge(flowEdge("port.page-snapshot.read", "callback.live-map-snapshot", flowAttrs({
            phase,
            provider: "page-snapshot-port",
          })));
        } else if (snapshot.kind === "supported-map-page") {
          trace.edge(flowEdge("port.page-snapshot.read", "callback.non-live-map-snapshot", flowAttrs({
            phase,
            provider: "page-snapshot-port",
          })));
          trace.edge(flowEdge("callback.non-live-map-snapshot", "inert.non-live-map-snapshot", flowAttrs({
            phase,
            terminal: "intentionally-inert",
          })));
        }
        return snapshot;
      },
    },
  };
}

function isLiveMapSnapshot(snapshot) {
  return snapshot.kind === "supported-map-page"
    && snapshot.provenance?.mapView?.kind !== "retained-during-surface-motion";
}

async function assertRefusesInitialPlacementFromSnapshot({
  testName,
  snapshot,
}) {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: testName,
  });
  const referenceImage = normalizedReferenceImage();
  const storage = createDurableStorageHarness({
    trace,
    durableState: null,
  });
  const input = createReferenceImageInputHarness({ trace });
  const pageSnapshot = createPageSnapshotHarness({
    trace,
    snapshot,
    phase: "initial-placement",
  });
  const initialPlacementPort = createInitialReferencePlacementHarness({
    trace,
    placement: placement(),
    phase: "initial-placement",
  });
  const host = createBrowserHostHarness({
    trace,
    durableStatePort: storage.port,
    referenceImageInputPort: input.port,
    pageSnapshotPort: pageSnapshot.port,
    initialReferencePlacementPort: initialPlacementPort.port,
  });

  const result = await startBrowserShell({ trace, host });
  await dispatchRenderedCommand({
    trace,
    phase: "start-input",
    dispatchCommand: host.latestRender.dispatchCommand,
    command: {
      kind: "activate-primary-action",
    },
  });
  await input.reportOutcome(1, {
    kind: "accepted",
    referenceImage,
  });

  assert.deepEqual(pageSnapshot.reads, [snapshot]);
  assert.deepEqual(initialPlacementPort.requests, []);
  assert.deepEqual(result.runtime.getState(), {
    session: {
      mode: "align",
      referenceImage,
    },
    notice: loadedReferenceImageNotice(referenceImage),
  });
  assert.deepEqual(storage.writes.at(-1), {
    session: {
      mode: "align",
      referenceImage,
    },
  });
}

function createInitialReferencePlacementHarness({
  trace,
  placement,
  phase = "initial-placement",
}) {
  const requests = [];
  return {
    requests,
    port: {
      createInitialReferencePlacement(request) {
        requests.push(request);
        trace.edge(flowEdge("callback.live-map-snapshot", "port.initial-reference-placement", flowAttrs({
          phase,
          surface: "shell-harness",
          provider: "browser-shell-effect-handler",
        })));
        trace.edge(flowEdge("port.initial-reference-placement", "sink.initial-reference-placement", flowAttrs({
          phase,
          terminal: "port-result",
        })));
        return placement;
      },
    },
  };
}

function loadedReferenceImageNotice(referenceImage) {
  return {
    kind: "reference-image-loaded",
    referenceImage,
  };
}

function createReferenceImageInputHarness({ trace }) {
  const starts = [];
  const cancellations = [];
  const reporters = new Map();
  return {
    starts,
    cancellations,
    async reportOutcome(requestId, outcome) {
      const source = "source.reference-image-input.outcome";
      const callback = "callback.reference-image-input.outcome";
      await trace.withSource(source, async () => {
        trace.edge(flowEdge(source, callback, flowAttrs({
          surface: "shell-harness",
          provider: "reference-image-input-harness",
        })));
        await trace.withSource(callback, async () => {
          trace.edge(flowEdge(callback, "command.report-reference-image-input-outcome", flowAttrs({
            surface: "shell-harness",
            provider: "reference-image-input-harness",
          })));
          await reporters.get(requestId)?.(outcome);
        });
      });
    },
    port: {
      startReferenceImageInput({ requestId, intent, reportOutcome }) {
        trace.edge(flowEdge("command.activate-primary-action", "effect.request-reference-image-input", flowAttrs({
          ...trace.activeAttributes(),
          surface: "shell-harness",
          provider: "application-effect",
        })));
        trace.edge(flowEdge("effect.request-reference-image-input", "port.reference-image-input.start", flowAttrs({
          surface: "shell-harness",
          provider: "browser-shell-effect-handler",
        })));
        trace.edge(flowEdge("port.reference-image-input.start", "callback.reference-image-input.outcome", flowAttrs({
          surface: "shell-harness",
          obligation: REFERENCE_IMAGE_INPUT_PROVIDER_OBLIGATION,
          provider: "reference-image-input-harness",
        })));
        starts.push({
          requestId,
          intent,
        });
        reporters.set(requestId, reportOutcome);
      },
      cancelReferenceImageInput({ requestId }) {
        trace.edge(flowEdge("command.activate-primary-action", "effect.cancel-reference-image-input", flowAttrs({
          ...trace.activeAttributes(),
          surface: "shell-harness",
          provider: "application-effect",
        })));
        trace.edge(flowEdge("effect.cancel-reference-image-input", "port.reference-image-input.cancel", flowAttrs({
          surface: "shell-harness",
          provider: "browser-shell-effect-handler",
        })));
        cancellations.push({
          requestId,
        });
        trace.edge(flowEdge("port.reference-image-input.cancel", "sink.reference-image-input.cancel", flowAttrs({
          surface: "shell-harness",
          terminal: "host-resource-disposed",
        })));
      },
    },
  };
}

function createComposedReferenceImageInputPort({
  trace,
  caseId,
  request,
  resource,
  referenceImage,
  paste,
}) {
  const port = createReferenceImageInputPortAdapter({
    async readClipboardImageHandle() {
      trace.edge(flowEdge("callback.reference-image-input.started", "port.clipboard-image.read", flowAttrs({
        caseId,
        phase: "direct-unavailable",
        request,
        surface: "composed-browser-shell",
        provider: "reference-image-input-port",
      })));
      trace.edge(flowEdge("port.clipboard-image.read", "callback.image-source-result", flowAttrs({
        caseId,
        phase: "direct-unavailable",
        request,
        surface: "composed-browser-shell",
        provider: "reference-image-input-port",
      })));
      return {
        kind: "unavailable",
      };
    },
    readPasteEventImageHandle(event) {
      trace.edge(flowEdge("callback.paste-event", "port.paste-event-image.read", flowAttrs({
        caseId,
        phase: "manual-paste",
        request,
        surface: "composed-browser-shell",
        provider: "reference-image-input-port",
      })));
      trace.edge(flowEdge("port.paste-event-image.read", "callback.image-source-result", flowAttrs({
        caseId,
        phase: "manual-paste",
        request,
        surface: "composed-browser-shell",
        provider: "reference-image-input-port",
      })));
      return {
        kind: "image",
        imageHandle: event.imageHandle,
      };
    },
    async normalizeImageHandle(imageHandle) {
      trace.edge(flowEdge("callback.image-source-result", "port.image-normalization.normalize", flowAttrs({
        caseId,
        phase: "manual-paste",
        request,
        surface: "composed-browser-shell",
        provider: "reference-image-input-port",
      })));
      assert.deepEqual(imageHandle, {
        runtimeHandle: "manual-image",
      });
      return {
        kind: "accepted",
        referenceImage,
      };
    },
    addPasteListener: paste.addPasteListenerWithTrace({
      trace,
      caseId,
      phase: "direct-unavailable",
      request,
      resource,
      surface: "composed-browser-shell",
    }),
  });

  return {
    async startReferenceImageInput({ requestId, intent, reportOutcome }) {
      assert.equal(requestIdentity(requestId), request);
      assert.deepEqual(intent, {
        kind: "load-reference-image",
      });
      trace.edge(flowEdge("command.activate-primary-action", "effect.request-reference-image-input", flowAttrs({
        caseId,
        phase: "start-input",
        request,
        surface: "composed-browser-shell",
        provider: "application",
      })));
      trace.edge(flowEdge("effect.request-reference-image-input", "port.reference-image-input.start", flowAttrs({
        caseId,
        phase: "start-input",
        request,
        surface: "composed-browser-shell",
        provider: "browser-shell-effect-handler",
      })));
      trace.edge(flowEdge("port.reference-image-input.start", "callback.reference-image-input.started", flowAttrs({
        caseId,
        phase: "start-input",
        request,
        surface: "composed-browser-shell",
        fulfills: REFERENCE_IMAGE_INPUT_PROVIDER_OBLIGATION,
        provider: "reference-image-input-port",
      })));
      await port.startReferenceImageInput({
        requestId,
        intent,
        reportOutcome: async (outcome) => {
          trace.edge(flowEdge("port.image-normalization.normalize", "callback.reference-image-input.outcome", flowAttrs({
            caseId,
            phase: "manual-paste",
            request,
            surface: "composed-browser-shell",
            provider: "reference-image-input-port",
          })));
          trace.edge(flowEdge("callback.reference-image-input.outcome", "command.report-reference-image-input-outcome", flowAttrs({
            caseId,
            phase: "manual-paste",
            request,
            surface: "composed-browser-shell",
            provider: "browser-shell-effect-handler",
          })));
          await trace.withAttributes(flowAttrs({
            caseId,
            phase: "accepted-outcome",
            request,
            surface: "composed-browser-shell",
          }), () => (
            trace.withSource("command.report-reference-image-input-outcome", () => reportOutcome(outcome))
          ));
        },
      });
    },
    cancelReferenceImageInput({ requestId }) {
      assert.equal(requestIdentity(requestId), request);
      port.cancelReferenceImageInput({ requestId });
    },
  };
}

function createPasteListenerHarness() {
  let listener = null;
  return {
    get isActive() {
      return listener !== null;
    },
    addPasteListener(handler) {
      listener = handler;
      return () => {
        if (listener === handler) {
          listener = null;
        }
      };
    },
    addPasteListenerWithTrace({
      trace,
      caseId,
      phase,
      request,
      resource,
      surface,
    }) {
      return (handler) => {
        trace.edge(flowEdge("callback.image-source-result", "port.paste-listener.add", flowAttrs({
          caseId,
          phase,
          request,
          surface,
          provider: "reference-image-input-port",
        })));
        trace.edge(flowEdge("port.paste-listener.add", "resource.paste-listener.active", flowAttrs({
          caseId,
          phase,
          request,
          resource,
          surface,
          provider: "reference-image-input-port",
        })));
        const dispose = this.addPasteListener(handler);
        return () => {
          dispose();
          trace.edge(flowEdge("resource.paste-listener.active", "sink.paste-listener.disposed", flowAttrs({
            caseId,
            phase,
            request,
            resource,
            surface,
            terminal: "host-resource-disposed",
          })));
        };
      };
    },
    async dispatch(event, traceContext) {
      const {
        trace,
        caseId,
        phase,
        request,
        resource,
      } = traceContext;
      if (!listener) {
        trace.edge(flowEdge("source.manual-paste-event", "inert.no-active-paste-listener", flowAttrs({
          caseId,
          phase,
          request,
          surface: "browser-event-loop",
          terminal: "intentionally-inert",
        })));
        return;
      }
      await trace.withSource("source.manual-paste-event", async () => {
        trace.edge(flowEdge("source.manual-paste-event", "resource.paste-listener.active", flowAttrs({
          caseId,
          phase,
          request,
          resource,
          surface: "browser-event-loop",
          provider: "browser-event-loop",
        })));
        await trace.withSource("resource.paste-listener.active", async () => {
          trace.edge(flowEdge("resource.paste-listener.active", "callback.paste-event", flowAttrs({
            caseId,
            phase,
            request,
            resource,
            surface: "composed-browser-shell",
            provider: "reference-image-input-port",
          })));
          await trace.withSource("callback.paste-event", async () => {
            await listener(event);
            trace.edge(flowEdge("callback.paste-event", "sink.paste-event.default-prevented", flowAttrs({
              caseId,
              phase,
              request,
              surface: "composed-browser-shell",
              terminal: "browser-event-consumed",
            })));
          });
        });
      });
    },
  };
}

function createDurableStorageHarness({ trace, durableState }) {
  const writes = [];
  return {
    writes,
    port: {
      async readDurableState() {
        trace.edge(flowEdge(trace.activeSource() ?? "source.browser-shell-startup", "port.durable-state.read", {
          provider: "browser-shell-harness",
        }));
        trace.edge(flowEdge("port.durable-state.read", "sink.startup-durable-state", {
          terminal: "port-result",
        }));
        return durableState;
      },
      async writeDurableState(nextDurableState) {
        if (trace.activeSource()?.startsWith("command.")) {
          trace.edge(flowEdge(trace.activeSource(), "effect.persist-durable-state", {
            ...trace.activeAttributes(),
            provider: "application",
          }));
        }
        trace.edge(flowEdge("effect.persist-durable-state", "port.durable-state.write", {
          ...trace.activeAttributes(),
          provider: "browser-shell-effect-handler",
        }));
        writes.push(nextDurableState);
        trace.edge(flowEdge("port.durable-state.write", "sink.durable-state.write", {
          ...trace.activeAttributes(),
          terminal: "durable-write",
        }));
      },
    },
  };
}

function caseEdges(trace, caseId) {
  return trace.edges.filter((edge) => edge.case === caseId);
}

function flowAttrs({
  caseId,
  phase,
  request,
  resource,
  surface,
  obligation,
  fulfills,
  provider,
  terminal,
} = {}) {
  const attributes = {};
  if (caseId !== undefined) {
    attributes.case = caseId;
  }
  if (phase !== undefined) {
    attributes.phase = phase;
  }
  if (request !== undefined) {
    attributes.request = request;
  }
  if (resource !== undefined) {
    attributes.resource = resource;
  }
  if (surface !== undefined) {
    attributes.surface = surface;
  }
  if (obligation !== undefined) {
    attributes.obligation = obligation;
  }
  if (fulfills !== undefined) {
    attributes.fulfills = fulfills;
  }
  if (provider !== undefined) {
    attributes.provider = provider;
  }
  if (terminal !== undefined) {
    attributes.terminal = terminal;
  }
  return attributes;
}

function createPasteEvent(extra = {}) {
  return {
    ...extra,
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
  };
}

function requestIdentity(requestId) {
  return `reference-image-input-${requestId}`;
}

function pasteListenerResourceIdentity(requestId) {
  return `paste-listener-${requestId}`;
}

function normalizedReferenceImage() {
  return {
    imageDataRef: "reference-image-data-1",
    intrinsicSizePx: {
      width: 640,
      height: 480,
    },
  };
}

function liveMapSnapshot() {
  return {
    kind: "supported-map-page",
    mapView: {
      zoom: 16,
      centerLatLon: {
        lat: -1.23,
        lon: 36.84,
      },
    },
    viewportPx: {
      width: 900,
      height: 600,
    },
    provenance: {
      mapView: {
        kind: "precise-rendered-tile",
      },
    },
  };
}

function placement() {
  return {
    x: 320,
    y: 240,
    scale: 1,
    rotationRad: 0,
  };
}
