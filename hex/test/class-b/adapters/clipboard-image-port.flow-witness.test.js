import test from "node:test";
import assert from "node:assert/strict";

import {
  createClipboardImagePortAdapter,
} from "../../../adapters/web/clipboard-image-port.js";
import {
  normalizeClipboardImage,
} from "../../../adapters/web/image-normalization.js";
import {
  createFlowTrace,
  flowEdge,
} from "../../support/flow-trace.js";

// Class-b, deliberately not class-a: this is browser-adapter translation, but
// the source-neutral failure taxonomy is non-negotiable at the app boundary.
// Unsupported clipboard content becomes `unsupported-image`, and clipboard API
// exceptions become `source-unavailable`; source-specific details stop here.
test("clipboard image port reports normalized paste outcomes", async () => {
  const trace = createClipboardImageTrace(
    "clipboard image port reports normalized paste outcomes",
  );
  const variants = [
    {
      phase: "empty",
      clipboardResult: {
        kind: "empty",
      },
      expected: {
        kind: "empty",
      },
    },
    {
      phase: "unsupported",
      clipboardResult: {
        kind: "unsupported",
        mimeTypes: ["text/plain"],
      },
      expected: {
        kind: "failed",
        reason: "unsupported-image",
      },
    },
    {
      phase: "unavailable",
      clipboardError: new Error("navigator.clipboard unavailable"),
      expected: {
        kind: "failed",
        reason: "source-unavailable",
      },
    },
    {
      phase: "decode-failed",
      clipboardResult: {
        kind: "image",
        imageHandle: {
          runtimeHandle: "image-1",
        },
      },
      normalizedImage: {
        kind: "failed",
        reason: "decode-failed",
      },
      expected: {
        kind: "failed",
        reason: "decode-failed",
      },
    },
    {
      phase: "accepted",
      clipboardResult: {
        kind: "image",
        imageHandle: {
          runtimeHandle: "image-1",
        },
      },
      normalizedImage: {
        kind: "accepted",
        referenceImage: {
          imageDataRef: "reference-image-data-1",
          intrinsicSizePx: {
            width: 640,
            height: 480,
          },
        },
      },
      expected: {
        kind: "accepted",
        referenceImage: {
          imageDataRef: "reference-image-data-1",
          intrinsicSizePx: {
            width: 640,
            height: 480,
          },
        },
      },
    },
  ];
  for (const { phase, clipboardResult, clipboardError, normalizedImage, expected } of variants) {
    const port = createClipboardImagePortAdapter({
      async readClipboardImageHandle() {
        trace.edge(flowEdge("port.clipboard-image.read", "callback.image-source-result", {
          ...phaseAttr(phase),
          provider: "clipboard-image-port",
        }));
        if (clipboardError) {
          throw clipboardError;
        }
        return clipboardResult;
      },
      async normalizeImageHandle(imageHandle) {
        trace.edge(flowEdge("callback.image-source-result", "port.image-normalization.normalize", {
          ...phaseAttr(phase),
          provider: "clipboard-image-port",
        }));
        assert.deepEqual(imageHandle, clipboardResult.imageHandle);
        return normalizedImage;
      },
    });

    const result = await readReferenceImage({
      trace,
      port,
      phase,
      imageSource: clipboardResult?.kind === "image",
    });

    assert.deepEqual(result, expected);
    assertPlainData(result);
  }
  assert.deepEqual(trace.edges, variants.flatMap(({ phase, clipboardResult }) => (
    readReferenceImageEdges({
      phase,
      imageSource: clipboardResult?.kind === "image",
    })
  )));
});

// Class-b, deliberately not class-a: this is input-source plumbing. Direct
// clipboard reads and paste-event handles must converge before application
// commands are created, so browser input source does not fork product semantics.
test("clipboard image port normalizes direct clipboard and paste-event image sources", async () => {
  const trace = createClipboardImageTrace(
    "clipboard image port normalizes direct clipboard and paste-event image sources",
  );
  const normalized = {
    kind: "accepted",
    referenceImage: {
      imageDataRef: "reference-image-data-1",
      intrinsicSizePx: {
        width: 640,
        height: 480,
      },
    },
  };
  const normalizedHandles = [];
  const port = createClipboardImagePortAdapter({
    async readClipboardImageHandle() {
      trace.edge(flowEdge("port.clipboard-image.read", "callback.image-source-result", {
        phase: "direct",
        provider: "clipboard-image-port",
      }));
      return {
        kind: "image",
        imageHandle: {
          runtimeHandle: "clipboard-image",
        },
      };
    },
    async normalizeImageHandle(imageHandle) {
      const phase = imageHandle.runtimeHandle === "clipboard-image"
        ? "direct"
        : "paste-event";
      trace.edge(flowEdge("callback.image-source-result", "port.image-normalization.normalize", {
        ...phaseAttr(phase),
        provider: "clipboard-image-port",
      }));
      normalizedHandles.push(imageHandle);
      return normalized;
    },
  });

  assert.deepEqual(await readReferenceImage({
    trace,
    port,
    phase: "direct",
    imageSource: true,
  }), normalized);
  assert.deepEqual(await readReferenceImageFromPasteEvent({
    trace,
    port,
    phase: "paste-event",
    imageHandle: {
      runtimeHandle: "event-image",
    },
  }), normalized);
  assert.deepEqual(normalizedHandles, [
    {
      runtimeHandle: "clipboard-image",
    },
    {
      runtimeHandle: "event-image",
    },
  ]);
  assert.deepEqual(trace.edges, [
    ...readReferenceImageEdges({
      phase: "direct",
      imageSource: true,
    }),
    ...pasteEventReadEdges({
      phase: "paste-event",
      imageSource: true,
    }),
  ]);
});

// Class-b, deliberately not class-a: this is the web decoder adapter boundary.
// Browser handles may exist while decoding, but the normalized output handed
// inward must be browser-neutral plain product data.
test("image normalization returns only browser-neutral image facts", async () => {
  const trace = createClipboardImageTrace(
    "image normalization returns only browser-neutral image facts",
  );
  const result = await trace.withSource("source.image-handle-normalization", async () => {
    trace.edge(flowEdge("source.image-handle-normalization", "port.image-normalization.normalize", {
      provider: "image-normalization-adapter",
    }));
    const normalized = await normalizeClipboardImage({
      imageHandle: {
        runtimeBlob: new Map([["opaque", true]]),
      },
      decodeImage: async () => ({
        imageDataRef: "reference-image-data-1",
        intrinsicSizePx: {
          width: 640,
          height: 480,
        },
        decodedImageHandle: new Map([["opaque", true]]),
      }),
    });
    trace.edge(flowEdge("port.image-normalization.normalize", "sink.reference-image-input.outcome", {
      terminal: "port-result",
    }));
    return normalized;
  });

  assert.deepEqual(result, {
    kind: "accepted",
    referenceImage: {
      imageDataRef: "reference-image-data-1",
      intrinsicSizePx: {
        width: 640,
        height: 480,
      },
    },
  });
  assertPlainData(result);
  assert.deepEqual(trace.edges, [
    flowEdge("source.image-handle-normalization", "port.image-normalization.normalize", {
      provider: "image-normalization-adapter",
    }),
    flowEdge("port.image-normalization.normalize", "sink.reference-image-input.outcome", {
      terminal: "port-result",
    }),
  ]);
});

function createClipboardImageTrace(testName) {
  return createFlowTrace({
    file: import.meta.url,
    test: testName,
  });
}

async function readReferenceImage({
  trace,
  port,
  phase,
  imageSource,
}) {
  return trace.withSource("source.clipboard-image-read", async () => {
    trace.edge(flowEdge("source.clipboard-image-read", "port.clipboard-image.read", {
      ...phaseAttr(phase),
      provider: "clipboard-image-port",
    }));
    const result = await port.readReferenceImage();
    if (!imageSource) {
      trace.edge(flowEdge("callback.image-source-result", "sink.reference-image-input.outcome", {
        ...phaseAttr(phase),
        terminal: "port-result",
      }));
    } else {
      trace.edge(flowEdge("port.image-normalization.normalize", "sink.reference-image-input.outcome", {
        ...phaseAttr(phase),
        terminal: "port-result",
      }));
    }
    return result;
  });
}

async function readReferenceImageFromPasteEvent({
  trace,
  port,
  phase,
  imageHandle,
}) {
  return trace.withSource("source.manual-paste-event", async () => {
    trace.edge(flowEdge("source.manual-paste-event", "port.paste-event-image.read", {
      ...phaseAttr(phase),
      provider: "clipboard-image-port",
    }));
    trace.edge(flowEdge("port.paste-event-image.read", "callback.image-source-result", {
      ...phaseAttr(phase),
      provider: "clipboard-image-port",
    }));
    const result = await port.readReferenceImageFromPasteEvent({ imageHandle });
    trace.edge(flowEdge("port.image-normalization.normalize", "sink.reference-image-input.outcome", {
      ...phaseAttr(phase),
      terminal: "port-result",
    }));
    return result;
  });
}

function readReferenceImageEdges({ phase, imageSource }) {
  const edges = [
    flowEdge("source.clipboard-image-read", "port.clipboard-image.read", {
      ...phaseAttr(phase),
      provider: "clipboard-image-port",
    }),
    flowEdge("port.clipboard-image.read", "callback.image-source-result", {
      ...phaseAttr(phase),
      provider: "clipboard-image-port",
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
      provider: "clipboard-image-port",
    }),
    flowEdge("port.image-normalization.normalize", "sink.reference-image-input.outcome", {
      ...phaseAttr(phase),
      terminal: "port-result",
    }),
  ];
}

function pasteEventReadEdges({ phase }) {
  return [
    flowEdge("source.manual-paste-event", "port.paste-event-image.read", {
      ...phaseAttr(phase),
      provider: "clipboard-image-port",
    }),
    flowEdge("port.paste-event-image.read", "callback.image-source-result", {
      ...phaseAttr(phase),
      provider: "clipboard-image-port",
    }),
    flowEdge("callback.image-source-result", "port.image-normalization.normalize", {
      ...phaseAttr(phase),
      provider: "clipboard-image-port",
    }),
    flowEdge("port.image-normalization.normalize", "sink.reference-image-input.outcome", {
      ...phaseAttr(phase),
      terminal: "port-result",
    }),
  ];
}

function phaseAttr(phase) {
  return phase === undefined ? {} : { phase };
}

function assertPlainData(value) {
  if (value === null) {
    return;
  }
  if (Array.isArray(value)) {
    for (const nestedValue of value) {
      assertPlainData(nestedValue);
    }
    return;
  }

  const valueType = typeof value;
  if (["string", "boolean"].includes(valueType)) {
    return;
  }
  if (valueType === "number") {
    assert.equal(Number.isFinite(value), true);
    return;
  }

  assert.equal(valueType, "object");
  assert.equal(Object.getPrototypeOf(value), Object.prototype);
  for (const [key, nestedValue] of Object.entries(value)) {
    assert.equal(typeof key, "string");
    assertPlainData(nestedValue);
  }
}
