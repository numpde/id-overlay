import test from "node:test";
import assert from "node:assert/strict";

import {
  createReferenceImageInputPortAdapter,
  readClipboardImageHandle,
  readPasteEventImageHandle,
} from "../../../adapters/web/reference-image-input-port.js";
import {
  createFlowTrace,
  flowEdge,
} from "../../support/flow-trace.js";

// Class-b, deliberately not class-a: this is browser-input lifecycle plumbing.
// The non-negotiable boundary is that browser tactics collapse before the app:
// direct clipboard reads, paste-event reads, decode failures, and unsupported
// content all report the same source-neutral outcome vocabulary.
test("reference-image input port reports direct source outcomes", async () => {
  const trace = createReferenceImageInputTrace(
    "reference-image input port reports direct source outcomes",
  );
  const variants = [
    {
      phase: "empty",
      sourceResult: {
        kind: "empty",
      },
      expectedOutcome: {
        kind: "empty",
      },
    },
    {
      phase: "unsupported",
      sourceResult: {
        kind: "unsupported",
      },
      expectedOutcome: {
        kind: "failed",
        reason: "unsupported-image",
      },
    },
    {
      phase: "accepted",
      sourceResult: {
        kind: "image",
        imageHandle: {
          runtimeHandle: "direct-image",
        },
      },
      normalizedOutcome: {
        kind: "accepted",
        referenceImage: normalizedReferenceImage(),
      },
      expectedOutcome: {
        kind: "accepted",
        referenceImage: normalizedReferenceImage(),
      },
    },
    {
      phase: "decode-failed",
      sourceResult: {
        kind: "image",
        imageHandle: {
          runtimeHandle: "unreadable-image",
        },
      },
      normalizedOutcome: {
        kind: "failed",
        reason: "decode-failed",
      },
      expectedOutcome: {
        kind: "failed",
        reason: "decode-failed",
      },
    },
  ];
  for (const { phase, sourceResult, normalizedOutcome, expectedOutcome } of variants) {
    const outcomes = [];
    const paste = createPasteListenerHarness();
    const port = createReferenceImageInputPortAdapter({
      async readClipboardImageHandle() {
        trace.edge(flowEdge("port.clipboard-image.read", "callback.image-source-result", {
          ...phaseAttr(phase),
          provider: "reference-image-input-port",
        }));
        return sourceResult;
      },
      async readPasteEventImageHandle() {
        throw new Error("manual paste should not be armed for direct outcomes");
      },
      async normalizeImageHandle(imageHandle) {
        trace.edge(flowEdge("callback.image-source-result", "port.image-normalization.normalize", {
          ...phaseAttr(phase),
          provider: "reference-image-input-port",
        }));
        assert.deepEqual(imageHandle, sourceResult.imageHandle);
        return normalizedOutcome;
      },
      addPasteListener: paste.addPasteListener,
    });

    await startReferenceImageInput({
      trace,
      port,
      requestId: 1,
      phase,
      intent: {
        kind: "load-reference-image",
      },
      reportOutcome: async (outcome) => {
        outcomes.push(outcome);
        trace.edge(flowEdge(
          sourceResult.kind === "image"
            ? "port.image-normalization.normalize"
            : "callback.image-source-result",
          "sink.reference-image-input.outcome",
          {
            ...phaseAttr(phase),
            terminal: "port-result",
          },
        ));
      },
    });

    assert.deepEqual(outcomes, [expectedOutcome]);
    assert.equal(paste.isActive, false);
  }
  assert.deepEqual(trace.edges, variants.flatMap(({ phase, sourceResult }) => (
    directInputEdges({
      phase,
      imageSource: sourceResult.kind === "image",
    })
  )));
});

// Class-b: direct-input unavailability is not a product failure while manual
// paste can still satisfy the same app request. The adapter owns that fallback
// and still reports only one normalized app outcome.
test("reference-image input port falls back from unavailable direct input to paste event", async () => {
  const trace = createReferenceImageInputTrace(
    "reference-image input port falls back from unavailable direct input to paste event",
  );
  const caseId = "manual-paste-fallback";
  const request = requestIdentity(1);
  const resource = pasteListenerResourceIdentity(1);
  const outcomes = [];
  const normalizedOutcome = {
    kind: "accepted",
    referenceImage: normalizedReferenceImage(),
  };
  const paste = createPasteListenerHarness();
  const normalizedHandles = [];
  const port = createReferenceImageInputPortAdapter({
    async readClipboardImageHandle() {
      trace.edge(flowEdge("port.clipboard-image.read", "callback.image-source-result", flowAttrs({
        caseId,
        phase: "direct-unavailable",
        request,
        surface: "browser-adapter",
        provider: "reference-image-input-port",
      })));
      return {
        kind: "unavailable",
      };
    },
    async readPasteEventImageHandle(event) {
      trace.edge(flowEdge("callback.paste-event", "port.paste-event-image.read", flowAttrs({
        caseId,
        phase: "manual-paste",
        request,
        surface: "browser-adapter",
        provider: "reference-image-input-port",
      })));
      trace.edge(flowEdge("port.paste-event-image.read", "callback.image-source-result", flowAttrs({
        caseId,
        phase: "manual-paste",
        request,
        surface: "browser-adapter",
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
        surface: "browser-adapter",
        provider: "reference-image-input-port",
      })));
      normalizedHandles.push(imageHandle);
      return normalizedOutcome;
    },
    addPasteListener: paste.addPasteListenerWithTrace({
      trace,
      caseId,
      phase: "direct-unavailable",
      request,
      resource,
      surface: "browser-adapter",
    }),
  });

  await startReferenceImageInput({
    trace,
    port,
    requestId: 1,
    caseId,
    phase: "direct-unavailable",
    request,
    surface: "browser-adapter",
    intent: {
      kind: "load-reference-image",
    },
    reportOutcome: async (outcome) => {
      outcomes.push(outcome);
      trace.edge(flowEdge("port.image-normalization.normalize", "sink.reference-image-input.outcome", flowAttrs({
        caseId,
        phase: "manual-paste",
        request,
        surface: "browser-adapter",
        terminal: "port-result",
      })));
    },
  });

  assert.equal(paste.isActive, true);
  assert.deepEqual(outcomes, []);

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
  assert.deepEqual(normalizedHandles, [{
    runtimeHandle: "manual-image",
  }]);
  assert.deepEqual(outcomes, [normalizedOutcome]);
  assert.deepEqual(trace.edges, [
    ...startInputEdges({
      caseId,
      phase: "direct-unavailable",
      request,
      surface: "browser-adapter",
    }),
    flowEdge("port.clipboard-image.read", "callback.image-source-result", flowAttrs({
      caseId,
      phase: "direct-unavailable",
      request,
      surface: "browser-adapter",
      provider: "reference-image-input-port",
    })),
    flowEdge("callback.image-source-result", "port.paste-listener.add", flowAttrs({
      caseId,
      phase: "direct-unavailable",
      request,
      surface: "browser-adapter",
      provider: "reference-image-input-port",
    })),
    flowEdge("port.paste-listener.add", "resource.paste-listener.active", flowAttrs({
      caseId,
      phase: "direct-unavailable",
      request,
      resource,
      surface: "browser-adapter",
      provider: "reference-image-input-port",
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
      surface: "browser-adapter",
      provider: "reference-image-input-port",
    })),
    flowEdge("callback.paste-event", "port.paste-event-image.read", flowAttrs({
      caseId,
      phase: "manual-paste",
      request,
      surface: "browser-adapter",
      provider: "reference-image-input-port",
    })),
    flowEdge("port.paste-event-image.read", "callback.image-source-result", flowAttrs({
      caseId,
      phase: "manual-paste",
      request,
      surface: "browser-adapter",
      provider: "reference-image-input-port",
    })),
    flowEdge("callback.image-source-result", "port.image-normalization.normalize", flowAttrs({
      caseId,
      phase: "manual-paste",
      request,
      surface: "browser-adapter",
      provider: "reference-image-input-port",
    })),
    flowEdge("resource.paste-listener.active", "sink.paste-listener.disposed", flowAttrs({
      caseId,
      phase: "direct-unavailable",
      request,
      resource,
      surface: "browser-adapter",
      terminal: "host-resource-disposed",
    })),
    flowEdge("port.image-normalization.normalize", "sink.reference-image-input.outcome", flowAttrs({
      caseId,
      phase: "manual-paste",
      request,
      surface: "browser-adapter",
      terminal: "port-result",
    })),
    flowEdge("callback.paste-event", "sink.paste-event.default-prevented", flowAttrs({
      caseId,
      phase: "manual-paste",
      request,
      surface: "browser-adapter",
      terminal: "browser-event-consumed",
    })),
  ]);
});

// Class-b: cancellation belongs to the same request id as the app effect. The
// adapter may have browser listeners or async reads in flight, but neither may
// report after the app has cancelled that request.
test("reference-image input port cancels active capture and suppresses late results", async () => {
  const trace = createReferenceImageInputTrace(
    "reference-image input port cancels active capture and suppresses late results",
  );
  const caseId = "manual-paste-cancel";
  const request = requestIdentity(1);
  const resource = pasteListenerResourceIdentity(1);
  const outcomes = [];
  const paste = createPasteListenerHarness();
  const port = createReferenceImageInputPortAdapter({
    async readClipboardImageHandle() {
      trace.edge(flowEdge("port.clipboard-image.read", "callback.image-source-result", flowAttrs({
        caseId,
        phase: "direct-unavailable",
        request,
        surface: "browser-adapter",
        provider: "reference-image-input-port",
      })));
      return {
        kind: "unavailable",
      };
    },
    async readPasteEventImageHandle() {
      trace.edge(flowEdge("callback.paste-event", "port.paste-event-image.read", {
        phase: "late-paste",
        provider: "reference-image-input-port",
      }));
      return {
        kind: "image",
        imageHandle: {
          runtimeHandle: "late-image",
        },
      };
    },
    async normalizeImageHandle() {
      trace.edge(flowEdge("callback.image-source-result", "port.image-normalization.normalize", {
        phase: "late-paste",
        provider: "reference-image-input-port",
      }));
      return {
        kind: "accepted",
        referenceImage: normalizedReferenceImage(),
      };
    },
    addPasteListener: paste.addPasteListenerWithTrace({
      trace,
      caseId,
      phase: "direct-unavailable",
      request,
      resource,
      surface: "browser-adapter",
    }),
  });

  await startReferenceImageInput({
    trace,
    port,
    requestId: 1,
    caseId,
    phase: "direct-unavailable",
    request,
    surface: "browser-adapter",
    intent: {
      kind: "load-reference-image",
    },
    reportOutcome: async (outcome) => {
      outcomes.push(outcome);
    },
  });
  cancelReferenceImageInput({
    trace,
    port,
    requestId: 1,
    caseId,
    phase: "cancel",
    request,
    surface: "browser-adapter",
  });
  await paste.dispatch(createPasteEvent({
    imageHandle: {
      runtimeHandle: "late-image",
    },
  }), {
    trace,
    caseId,
    phase: "late-paste",
    request,
  });

  assert.equal(paste.isActive, false);
  assert.deepEqual(outcomes, []);
  assert.deepEqual(trace.edges, [
    ...startInputEdges({
      caseId,
      phase: "direct-unavailable",
      request,
      surface: "browser-adapter",
    }),
    flowEdge("port.clipboard-image.read", "callback.image-source-result", flowAttrs({
      caseId,
      phase: "direct-unavailable",
      request,
      surface: "browser-adapter",
      provider: "reference-image-input-port",
    })),
    flowEdge("callback.image-source-result", "port.paste-listener.add", flowAttrs({
      caseId,
      phase: "direct-unavailable",
      request,
      surface: "browser-adapter",
      provider: "reference-image-input-port",
    })),
    flowEdge("port.paste-listener.add", "resource.paste-listener.active", flowAttrs({
      caseId,
      phase: "direct-unavailable",
      request,
      resource,
      surface: "browser-adapter",
      provider: "reference-image-input-port",
    })),
    flowEdge("source.reference-image-input.cancel", "port.reference-image-input.cancel", flowAttrs({
      caseId,
      phase: "cancel",
      request,
      surface: "browser-adapter",
      provider: "reference-image-input-port",
    })),
    flowEdge("resource.paste-listener.active", "sink.paste-listener.disposed", flowAttrs({
      caseId,
      phase: "direct-unavailable",
      request,
      resource,
      surface: "browser-adapter",
      terminal: "host-resource-disposed",
    })),
    flowEdge("port.reference-image-input.cancel", "sink.reference-image-input.cancel", flowAttrs({
      caseId,
      phase: "cancel",
      request,
      surface: "browser-adapter",
      terminal: "host-resource-disposed",
    })),
    flowEdge("source.manual-paste-event", "inert.no-active-paste-listener", flowAttrs({
      caseId,
      phase: "late-paste",
      request,
      surface: "browser-event-loop",
      terminal: "intentionally-inert",
    })),
  ]);
});

// Class-b: request replacement is adapter-local lifecycle hygiene, not product
// causality. Starting a newer request must retire the older browser work so a
// late direct-read result cannot complete the wrong app request.
test("reference-image input port retires an older pending request before starting a newer one", async () => {
  const trace = createReferenceImageInputTrace(
    "reference-image input port retires an older pending request before starting a newer one",
  );
  const firstRead = createDeferred();
  const outcomes = [];
  const sourceResults = [
    {
      phase: "first-request",
      result: firstRead.promise,
    },
    {
      phase: "second-request",
      result: Promise.resolve({
        kind: "empty",
      }),
    },
  ];
  const port = createReferenceImageInputPortAdapter({
    async readClipboardImageHandle() {
      const source = sourceResults.shift();
      const result = await source.result;
      trace.edge(flowEdge("port.clipboard-image.read", "callback.image-source-result", {
        ...phaseAttr(source.phase),
        provider: "reference-image-input-port",
      }));
      return result;
    },
    async readPasteEventImageHandle() {
      throw new Error("manual paste should not be armed");
    },
    async normalizeImageHandle(imageHandle) {
      trace.edge(flowEdge("callback.image-source-result", "port.image-normalization.normalize", {
        phase: "first-request",
        provider: "reference-image-input-port",
      }));
      assert.deepEqual(imageHandle, {
        runtimeHandle: "stale-direct-image",
      });
      return {
        kind: "accepted",
        referenceImage: normalizedReferenceImage(),
      };
    },
    addPasteListener: createPasteListenerHarness().addPasteListener,
  });

  const firstStart = startReferenceImageInput({
    trace,
    port,
    requestId: 1,
    phase: "first-request",
    intent: {
      kind: "load-reference-image",
    },
    reportOutcome: async (outcome) => {
      outcomes.push({
        requestId: 1,
        outcome,
      });
    },
  });
  await flushMicrotasks();

  await startReferenceImageInput({
    trace,
    port,
    requestId: 2,
    phase: "second-request",
    intent: {
      kind: "load-reference-image",
    },
    reportOutcome: async (outcome) => {
      outcomes.push({
        requestId: 2,
        outcome,
      });
      trace.edge(flowEdge("callback.image-source-result", "sink.reference-image-input.outcome", {
        phase: "second-request",
        terminal: "port-result",
      }));
    },
  });

  firstRead.resolve({
    kind: "image",
    imageHandle: {
      runtimeHandle: "stale-direct-image",
    },
  });
  await firstStart;
  trace.edge(flowEdge("callback.image-source-result", "inert.stale-reference-image-input", {
    phase: "first-request",
    terminal: "intentionally-inert",
  }));

  assert.deepEqual(outcomes, [{
    requestId: 2,
    outcome: {
      kind: "empty",
    },
  }]);
  assert.deepEqual(trace.edges, [
    ...startInputEdges("first-request"),
    ...startInputEdges("second-request"),
    flowEdge("port.clipboard-image.read", "callback.image-source-result", {
      phase: "second-request",
      provider: "reference-image-input-port",
    }),
    flowEdge("callback.image-source-result", "sink.reference-image-input.outcome", {
      phase: "second-request",
      terminal: "port-result",
    }),
    flowEdge("port.clipboard-image.read", "callback.image-source-result", {
      phase: "first-request",
      provider: "reference-image-input-port",
    }),
    flowEdge("callback.image-source-result", "inert.stale-reference-image-input", {
      phase: "first-request",
      terminal: "intentionally-inert",
    }),
  ]);
});

// Class-b: these source readers are browser-shape adapters. They may touch
// ClipboardItem/DataTransferItem mechanics, but their outward facts are still
// small source-neutral handle facts for the lifecycle adapter above.
test("browser source readers extract image handles from clipboard and paste-event shapes", async () => {
  const trace = createReferenceImageInputTrace(
    "browser source readers extract image handles from clipboard and paste-event shapes",
  );
  const clipboardBlob = {
    label: "clipboard-blob",
  };
  const pasteBlob = {
    label: "paste-blob",
  };

  assert.deepEqual(await readBrowserClipboardImageHandle({
    trace,
    phase: "clipboard",
    read: () => readClipboardImageHandle({
    clipboard: {
      async read() {
        return [{
          types: ["text/plain", "image/png"],
          async getType(type) {
            return {
              ...clipboardBlob,
              type,
            };
          },
        }];
      },
    },
    }),
  }), {
    kind: "image",
    imageHandle: {
      runtimeBlob: {
        ...clipboardBlob,
        type: "image/png",
      },
      mimeType: "image/png",
    },
  });

  assert.deepEqual(readBrowserPasteEventImageHandle({
    trace,
    phase: "paste-event",
    read: () => readPasteEventImageHandle({
    clipboardData: {
      items: [{
        kind: "string",
        type: "text/plain",
      }, {
        kind: "file",
        type: "image/jpeg",
        getAsFile() {
          return pasteBlob;
        },
      }],
    },
    }),
  }), {
    kind: "image",
    imageHandle: {
      runtimeBlob: pasteBlob,
      mimeType: "image/jpeg",
    },
  });
  assert.deepEqual(trace.edges, [
    flowEdge("source.browser-clipboard-read", "port.clipboard-image.read", {
      phase: "clipboard",
      provider: "browser-source-reader",
    }),
    flowEdge("port.clipboard-image.read", "sink.clipboard-image-handle", {
      phase: "clipboard",
      terminal: "port-result",
    }),
    flowEdge("source.manual-paste-event", "port.paste-event-image.read", {
      phase: "paste-event",
      provider: "browser-source-reader",
    }),
    flowEdge("port.paste-event-image.read", "sink.clipboard-image-handle", {
      phase: "paste-event",
      terminal: "port-result",
    }),
  ]);
});

function createReferenceImageInputTrace(testName) {
  return createFlowTrace({
    file: import.meta.url,
    test: testName,
  });
}

async function startReferenceImageInput({
  trace,
  port,
  requestId,
  intent,
  reportOutcome,
  caseId,
  phase,
  request,
  surface,
}) {
  return trace.withSource("source.reference-image-input.start", async () => {
    for (const edge of startInputEdges({
      caseId,
      phase,
      request,
      surface,
    })) {
      trace.edge(edge);
    }
    await port.startReferenceImageInput({
      requestId,
      intent,
      reportOutcome,
    });
  });
}

function cancelReferenceImageInput({
  trace,
  port,
  requestId,
  caseId,
  phase,
  request,
  surface,
}) {
  trace.withSource("source.reference-image-input.cancel", () => {
    trace.edge(flowEdge("source.reference-image-input.cancel", "port.reference-image-input.cancel", flowAttrs({
      caseId,
      phase,
      request,
      surface,
      provider: "reference-image-input-port",
    })));
    port.cancelReferenceImageInput({ requestId });
    trace.edge(flowEdge("port.reference-image-input.cancel", "sink.reference-image-input.cancel", flowAttrs({
      caseId,
      phase,
      request,
      surface,
      terminal: "host-resource-disposed",
    })));
  });
}

function startInputEdges(input) {
  const options = typeof input === "string"
    ? { phase: input }
    : input ?? {};
  return [
    flowEdge("source.reference-image-input.start", "port.reference-image-input.start", flowAttrs({
      ...options,
      provider: "reference-image-input-port",
    })),
    flowEdge("port.reference-image-input.start", "callback.reference-image-input.started", flowAttrs({
      ...options,
      provider: "reference-image-input-port",
    })),
    flowEdge("callback.reference-image-input.started", "port.clipboard-image.read", flowAttrs({
      ...options,
      provider: "reference-image-input-port",
    })),
  ];
}

function directInputEdges({ phase, imageSource }) {
  const edges = [
    ...startInputEdges(phase),
    flowEdge("port.clipboard-image.read", "callback.image-source-result", {
      ...phaseAttr(phase),
      provider: "reference-image-input-port",
    }),
  ];
  if (!imageSource) {
    return [
      ...edges,
      flowEdge("callback.image-source-result", "sink.reference-image-input.outcome", {
        ...phaseAttr(phase),
        terminal: "port-result",
      }),
    ];
  }
  return [
    ...edges,
    flowEdge("callback.image-source-result", "port.image-normalization.normalize", {
      ...phaseAttr(phase),
      provider: "reference-image-input-port",
    }),
    flowEdge("port.image-normalization.normalize", "sink.reference-image-input.outcome", {
      ...phaseAttr(phase),
      terminal: "port-result",
    }),
  ];
}

async function readBrowserClipboardImageHandle({ trace, phase, read }) {
  return trace.withSource("source.browser-clipboard-read", async () => {
    trace.edge(flowEdge("source.browser-clipboard-read", "port.clipboard-image.read", {
      ...phaseAttr(phase),
      provider: "browser-source-reader",
    }));
    const result = await read();
    trace.edge(flowEdge("port.clipboard-image.read", "sink.clipboard-image-handle", {
      ...phaseAttr(phase),
      terminal: "port-result",
    }));
    return result;
  });
}

function readBrowserPasteEventImageHandle({ trace, phase, read }) {
  return trace.withSource("source.manual-paste-event", () => {
    trace.edge(flowEdge("source.manual-paste-event", "port.paste-event-image.read", {
      ...phaseAttr(phase),
      provider: "browser-source-reader",
    }));
    const result = read();
    trace.edge(flowEdge("port.paste-event-image.read", "sink.clipboard-image-handle", {
      ...phaseAttr(phase),
      terminal: "port-result",
    }));
    return result;
  });
}

function phaseAttr(phase) {
  return phase === undefined ? {} : { phase };
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

function requestIdentity(requestId) {
  return `reference-image-input-${requestId}`;
}

function pasteListenerResourceIdentity(requestId) {
  return `paste-listener-${requestId}`;
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
    async dispatch(event, traceContext = {}) {
      const {
        trace,
        caseId,
        phase,
        request,
        resource,
      } = traceContext;
      if (!listener) {
        trace?.edge(flowEdge("source.manual-paste-event", "inert.no-active-paste-listener", flowAttrs({
          caseId,
          phase,
          request,
          surface: "browser-event-loop",
          terminal: "intentionally-inert",
        })));
        return;
      }
      if (trace) {
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
              surface: "browser-adapter",
              provider: "reference-image-input-port",
            })));
            await trace.withSource("callback.paste-event", async () => {
              await listener(event);
              trace.edge(flowEdge("callback.paste-event", "sink.paste-event.default-prevented", flowAttrs({
                caseId,
                phase,
                request,
                surface: "browser-adapter",
                terminal: "browser-event-consumed",
              })));
            });
          });
        });
        return;
      }
      await listener(event);
    },
  };
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

function createDeferred() {
  let resolve;
  return {
    promise: new Promise((resolver) => {
      resolve = resolver;
    }),
    resolve,
  };
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
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
