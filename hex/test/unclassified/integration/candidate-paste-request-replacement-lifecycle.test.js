import test from "node:test";
import assert from "node:assert/strict";

import {
  bootstrapBrowserExtension,
} from "../../../bootstrap/index.js";
import {
  createBrowserHostHarness,
  createClipboardImageHarness,
  createDeferred,
  createDurableStorageHarness,
  flushMicrotasks,
  normalizedReferenceImage,
} from "./candidate-browser-harness.js";

// Unclassified: request correlation is already a class-a reducer law. This
// candidate pins the browser-shell consequence: replacing a paste request must
// cancel the old capture/effect and only the newest accepted image may commit.
test("candidate: starting a second paste request cancels the first and commits only the second result", async () => {
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
