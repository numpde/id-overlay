import test from "node:test";
import assert from "node:assert/strict";

import {
  bootstrapBrowserExtension,
} from "../../../bootstrap/index.js";

// Class-c: this candidate currently conflicts with product law, not just
// implementation. Request correlation is class-a, but primary action while
// awaiting paste is also class-a as "Cancel paste"; this test assumes the same
// click starts request #2. Promote only if a distinct "replace pending paste"
// user action exists, and then route it through the real clipboard/manual-paste
// shell boundary rather than this invented port pair.
test("starting a second paste request cancels the first and commits only the second result", async () => {
  const firstRead = createDeferred();
  const secondRead = createDeferred();
  const firstImage = normalizedReferenceImage("first");
  const secondImage = normalizedReferenceImage("second");
  const clipboard = createClipboardImageHarness({
    readReferenceImageResults: [
      firstRead.promise,
      secondRead.promise,
    ],
  });
  const manualPaste = createManualPasteCaptureHarness();
  const storage = createDurableStorageHarness({
    durableState: null,
  });
  const host = createBrowserHostHarness({
    durableStatePort: storage.port,
    clipboardImagePort: clipboard.port,
    manualPasteCapturePort: manualPaste.port,
  });

  await bootstrapBrowserExtension(host);
  const firstDispatch = host.latestRender.dispatchCommand({
    kind: "activate-primary-action",
  });
  await flushMicrotasks();
  const secondDispatch = host.latestRender.dispatchCommand({
    kind: "activate-primary-action",
  });
  await flushMicrotasks();

  secondRead.resolve({
    kind: "accepted",
    referenceImage: secondImage,
  });
  await secondDispatch;
  firstRead.resolve({
    kind: "accepted",
    referenceImage: firstImage,
  });
  await firstDispatch;

  assert.equal(clipboard.readReferenceImageCount, 2);
  assert.deepEqual(manualPaste.cancelledRequestIds, [1]);
  assert.deepEqual(host.runtime.getState().session.referenceImage, secondImage);
  assert.deepEqual(storage.writes, [{
    session: {
      mode: "align",
      referenceImage: secondImage,
    },
  }]);
});

function createBrowserHostHarness({
  durableStatePort,
  clipboardImagePort,
  manualPasteCapturePort,
}) {
  return {
    pageContext: {
      kind: "supported-map-editor-page",
    },
    durableStatePort,
    clipboardImagePort,
    manualPasteCapturePort,
    latestRender: null,
    runtime: null,
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
      this.runtime = runtime;
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

function createClipboardImageHarness({
  readReferenceImageResults,
}) {
  let readReferenceImageCount = 0;
  return {
    get readReferenceImageCount() {
      return readReferenceImageCount;
    },
    port: {
      async readReferenceImage() {
        const result = readReferenceImageResults[readReferenceImageCount];
        readReferenceImageCount += 1;
        return result;
      },
    },
  };
}

function createManualPasteCaptureHarness() {
  const cancelledRequestIds = [];
  return {
    cancelledRequestIds,
    port: {
      startManualPasteCapture() {},
      cancelManualPasteCapture({ requestId }) {
        cancelledRequestIds.push(requestId);
      },
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

function normalizedReferenceImage(label) {
  return {
    imageDataRef: `data:image/png;base64,${label}`,
    intrinsicSizePx: {
      width: 640,
      height: 480,
    },
  };
}
