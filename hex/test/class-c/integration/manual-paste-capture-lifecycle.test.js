import test from "node:test";
import assert from "node:assert/strict";

import {
  bootstrapBrowserExtension,
} from "../../../bootstrap/index.js";

// Class-c: legacy supported manual paste capture when direct Clipboard API
// reads were unavailable. The target boundary is request ownership: fallback
// capture belongs to the shell, while accepted image data re-enters through the
// same application paste-outcome command as direct clipboard reads.
test("Clipboard API unavailable starts request-bound manual paste capture", async () => {
  const referenceImage = normalizedReferenceImage();
  const storage = createDurableStorageHarness({
    durableState: null,
  });
  const clipboard = createClipboardImageHarness({
    readReferenceImageResult: {
      kind: "failed",
      reason: "clipboard-api-unavailable",
    },
    readReferenceImageFromPasteEventResult: {
      kind: "accepted",
      referenceImage,
    },
  });
  const manualPaste = createManualPasteCaptureHarness();
  const host = createBrowserHostHarness({
    durableStatePort: storage.port,
    clipboardImagePort: clipboard.port,
    manualPasteCapturePort: manualPaste.port,
  });

  const result = await bootstrapBrowserExtension(host);
  await host.latestRender.dispatchCommand({
    kind: "activate-primary-action",
  });

  assert.equal(clipboard.readReferenceImageCount, 1);
  assert.deepEqual(manualPaste.startedRequestIds, [1]);

  await manualPaste.completeWithImageHandle({
    runtimeHandle: "manual-paste-image",
  });

  assert.deepEqual(clipboard.pasteEventImageHandles, [{
    runtimeHandle: "manual-paste-image",
  }]);
  assert.deepEqual(result.runtime.getState(), {
    session: {
      mode: "align",
      referenceImage,
    },
  });
  assert.deepEqual(storage.writes, [{
    session: {
      mode: "align",
      referenceImage,
    },
  }]);
});

// Class-c: cancellation must be request-bound. A late paste event from a
// cancelled manual capture must not resurrect an image session or write durable
// state after the user has explicitly cancelled Paste.
test("cancelling Paste cancels manual capture and ignores late paste event", async () => {
  const storage = createDurableStorageHarness({
    durableState: null,
  });
  const clipboard = createClipboardImageHarness({
    readReferenceImageResult: {
      kind: "failed",
      reason: "clipboard-api-unavailable",
    },
    readReferenceImageFromPasteEventResult: {
      kind: "accepted",
      referenceImage: normalizedReferenceImage(),
    },
  });
  const manualPaste = createManualPasteCaptureHarness();
  const host = createBrowserHostHarness({
    durableStatePort: storage.port,
    clipboardImagePort: clipboard.port,
    manualPasteCapturePort: manualPaste.port,
  });

  const result = await bootstrapBrowserExtension(host);
  await host.latestRender.dispatchCommand({
    kind: "activate-primary-action",
  });
  await host.latestRender.dispatchCommand({
    kind: "activate-primary-action",
  });
  await manualPaste.completeWithImageHandle({
    runtimeHandle: "late-manual-paste-image",
  });

  assert.deepEqual(manualPaste.cancelledRequestIds, [1]);
  assert.equal(result.runtime.getState().session, undefined);
  assert.equal(host.latestRender.view.overlay.visible, false);
  assert.deepEqual(storage.writes, []);
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

function createClipboardImageHarness({
  readReferenceImageResult,
  readReferenceImageFromPasteEventResult,
}) {
  const pasteEventImageHandles = [];
  let readReferenceImageCount = 0;
  return {
    get readReferenceImageCount() {
      return readReferenceImageCount;
    },
    pasteEventImageHandles,
    port: {
      async readReferenceImage() {
        readReferenceImageCount += 1;
        return readReferenceImageResult;
      },
      async readReferenceImageFromPasteEvent({ imageHandle }) {
        pasteEventImageHandles.push(imageHandle);
        return readReferenceImageFromPasteEventResult;
      },
    },
  };
}

function createManualPasteCaptureHarness() {
  let complete = null;
  const startedRequestIds = [];
  const cancelledRequestIds = [];
  return {
    startedRequestIds,
    cancelledRequestIds,
    async completeWithImageHandle(imageHandle) {
      await complete?.({
        imageHandle,
      });
    },
    port: {
      startManualPasteCapture({ requestId, completePasteImageHandle }) {
        startedRequestIds.push(requestId);
        complete = completePasteImageHandle;
      },
      cancelManualPasteCapture({ requestId }) {
        cancelledRequestIds.push(requestId);
        complete = null;
      },
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
