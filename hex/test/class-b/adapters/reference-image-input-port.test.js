import test from "node:test";
import assert from "node:assert/strict";

import {
  createReferenceImageInputPortAdapter,
  readClipboardImageHandle,
  readPasteEventImageHandle,
} from "../../../adapters/web/reference-image-input-port.js";

// Class-b, deliberately not class-a: this is browser-input lifecycle plumbing.
// The non-negotiable boundary is that browser tactics collapse before the app:
// direct clipboard reads, paste-event reads, decode failures, and unsupported
// content all report the same source-neutral outcome vocabulary.
test("reference-image input port reports direct source outcomes", async () => {
  for (const { sourceResult, normalizedOutcome, expectedOutcome } of [
    {
      sourceResult: {
        kind: "empty",
      },
      expectedOutcome: {
        kind: "empty",
      },
    },
    {
      sourceResult: {
        kind: "unsupported",
      },
      expectedOutcome: {
        kind: "failed",
        reason: "unsupported-image",
      },
    },
    {
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
  ]) {
    const outcomes = [];
    const paste = createPasteListenerHarness();
    const port = createReferenceImageInputPortAdapter({
      async readClipboardImageHandle() {
        return sourceResult;
      },
      async readPasteEventImageHandle() {
        throw new Error("manual paste should not be armed for direct outcomes");
      },
      async normalizeImageHandle() {
        return normalizedOutcome;
      },
      addPasteListener: paste.addPasteListener,
    });

    await port.startReferenceImageInput({
      requestId: 1,
      intent: {
        kind: "load-reference-image",
      },
      reportOutcome: async (outcome) => {
        outcomes.push(outcome);
      },
    });

    assert.deepEqual(outcomes, [expectedOutcome]);
    assert.equal(paste.isActive, false);
  }
});

// Class-b: direct-input unavailability is not a product failure while manual
// paste can still satisfy the same app request. The adapter owns that fallback
// and still reports only one normalized app outcome.
test("reference-image input port falls back from unavailable direct input to paste event", async () => {
  const outcomes = [];
  const normalizedOutcome = {
    kind: "accepted",
    referenceImage: normalizedReferenceImage(),
  };
  const paste = createPasteListenerHarness();
  const normalizedHandles = [];
  const port = createReferenceImageInputPortAdapter({
    async readClipboardImageHandle() {
      return {
        kind: "unavailable",
      };
    },
    async readPasteEventImageHandle(event) {
      return {
        kind: "image",
        imageHandle: event.imageHandle,
      };
    },
    async normalizeImageHandle(imageHandle) {
      normalizedHandles.push(imageHandle);
      return normalizedOutcome;
    },
    addPasteListener: paste.addPasteListener,
  });

  await port.startReferenceImageInput({
    requestId: 1,
    intent: {
      kind: "load-reference-image",
    },
    reportOutcome: async (outcome) => {
      outcomes.push(outcome);
    },
  });

  assert.equal(paste.isActive, true);
  assert.deepEqual(outcomes, []);

  const pasteEvent = createPasteEvent({
    imageHandle: {
      runtimeHandle: "manual-image",
    },
  });
  await paste.dispatch(pasteEvent);

  assert.equal(pasteEvent.defaultPrevented, true);
  assert.equal(paste.isActive, false);
  assert.deepEqual(normalizedHandles, [{
    runtimeHandle: "manual-image",
  }]);
  assert.deepEqual(outcomes, [normalizedOutcome]);
});

// Class-b: cancellation belongs to the same request id as the app effect. The
// adapter may have browser listeners or async reads in flight, but neither may
// report after the app has cancelled that request.
test("reference-image input port cancels active capture and suppresses late results", async () => {
  const outcomes = [];
  const paste = createPasteListenerHarness();
  const port = createReferenceImageInputPortAdapter({
    async readClipboardImageHandle() {
      return {
        kind: "unavailable",
      };
    },
    async readPasteEventImageHandle() {
      return {
        kind: "image",
        imageHandle: {
          runtimeHandle: "late-image",
        },
      };
    },
    async normalizeImageHandle() {
      return {
        kind: "accepted",
        referenceImage: normalizedReferenceImage(),
      };
    },
    addPasteListener: paste.addPasteListener,
  });

  await port.startReferenceImageInput({
    requestId: 1,
    intent: {
      kind: "load-reference-image",
    },
    reportOutcome: async (outcome) => {
      outcomes.push(outcome);
    },
  });
  port.cancelReferenceImageInput({
    requestId: 1,
  });
  await paste.dispatch(createPasteEvent({
    imageHandle: {
      runtimeHandle: "late-image",
    },
  }));

  assert.equal(paste.isActive, false);
  assert.deepEqual(outcomes, []);
});

// Class-b: request replacement is adapter-local lifecycle hygiene, not product
// causality. Starting a newer request must retire the older browser work so a
// late direct-read result cannot complete the wrong app request.
test("reference-image input port retires an older pending request before starting a newer one", async () => {
  const firstRead = createDeferred();
  const outcomes = [];
  const sourceResults = [
    firstRead.promise,
    Promise.resolve({
      kind: "empty",
    }),
  ];
  const port = createReferenceImageInputPortAdapter({
    async readClipboardImageHandle() {
      return sourceResults.shift();
    },
    async readPasteEventImageHandle() {
      throw new Error("manual paste should not be armed");
    },
    async normalizeImageHandle() {
      return {
        kind: "accepted",
        referenceImage: normalizedReferenceImage(),
      };
    },
    addPasteListener: createPasteListenerHarness().addPasteListener,
  });

  const firstStart = port.startReferenceImageInput({
    requestId: 1,
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

  await port.startReferenceImageInput({
    requestId: 2,
    intent: {
      kind: "load-reference-image",
    },
    reportOutcome: async (outcome) => {
      outcomes.push({
        requestId: 2,
        outcome,
      });
    },
  });

  firstRead.resolve({
    kind: "image",
    imageHandle: {
      runtimeHandle: "stale-direct-image",
    },
  });
  await firstStart;

  assert.deepEqual(outcomes, [{
    requestId: 2,
    outcome: {
      kind: "empty",
    },
  }]);
});

// Class-b: these source readers are browser-shape adapters. They may touch
// ClipboardItem/DataTransferItem mechanics, but their outward facts are still
// small source-neutral handle facts for the lifecycle adapter above.
test("browser source readers extract image handles from clipboard and paste-event shapes", async () => {
  const clipboardBlob = {
    label: "clipboard-blob",
  };
  const pasteBlob = {
    label: "paste-blob",
  };

  assert.deepEqual(await readClipboardImageHandle({
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

  assert.deepEqual(readPasteEventImageHandle({
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
  }), {
    kind: "image",
    imageHandle: {
      runtimeBlob: pasteBlob,
      mimeType: "image/jpeg",
    },
  });
});

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
    async dispatch(event) {
      await listener?.(event);
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
