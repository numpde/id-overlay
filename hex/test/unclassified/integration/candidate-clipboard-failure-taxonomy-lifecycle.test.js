import test from "node:test";
import assert from "node:assert/strict";

import {
  bootstrapBrowserExtension,
} from "../../../bootstrap/index.js";
import {
  createBrowserHostHarness,
  createClipboardImageHarness,
  createDurableStorageHarness,
} from "./candidate-browser-harness.js";

// Unclassified: the exact clipboard adapter vocabulary is not promoted yet.
// The high-value contract is the failure taxonomy: "API unavailable" is a
// recoverable manual-paste path, while "missing image" and "unreadable image"
// are distinct user-facing outcomes that must not create durable image state.
test("candidate: clipboard-api unavailable starts manual paste capture instead of failing", async () => {
  const storage = createDurableStorageHarness({
    durableState: null,
  });
  const clipboard = createClipboardImageHarness({
    readReferenceImageResults: [{
      kind: "unavailable",
    }],
  });
  const manualPaste = createManualPasteCaptureHarness();
  const host = createBrowserHostHarness({
    durableStatePort: storage.port,
    clipboardImagePort: clipboard.port,
    manualPasteCapturePort: manualPaste.port,
  });

  await bootstrapBrowserExtension(host);
  await host.latestRender.dispatchCommand({
    kind: "activate-primary-action",
  });

  assert.equal(clipboard.readReferenceImageCount, 1);
  assert.deepEqual(manualPaste.startedRequestIds, [1]);
  assert.match(host.latestRender.view.status, /Ctrl|Cmd|paste/i);
  assert.deepEqual(storage.writes, []);
});

// Unclassified: this is stricter than the current reducer. It says failure
// reasons are not free-form debug strings once they reach the user boundary;
// each supported outcome has one canonical product message.
test("candidate: missing and unreadable clipboard images render distinct notices", async () => {
  assert.equal(
    await readPasteFailureStatus({
      reason: "missing-image",
      source: "clipboard-api",
    }),
    "Clipboard does not contain an image. Press Ctrl/Cmd+V to paste an image from your clipboard.",
  );
  assert.equal(
    await readPasteFailureStatus({
      reason: "unreadable-image",
      source: "manual-paste",
    }),
    "Clipboard image could not be read.",
  );
});

async function readPasteFailureStatus({ reason, source }) {
  const host = createBrowserHostHarness();

  await bootstrapBrowserExtension(host);
  await host.latestRender.dispatchCommand({
    kind: "activate-primary-action",
  });
  await host.latestRender.dispatchCommand({
    kind: "report-reference-image-paste-outcome",
    requestId: 1,
    source,
    outcome: {
      kind: "failed",
      reason,
    },
  });

  return host.latestRender.view.status;
}

function createManualPasteCaptureHarness() {
  const startedRequestIds = [];
  const cancelledRequestIds = [];
  return {
    startedRequestIds,
    cancelledRequestIds,
    port: {
      startManualPasteCapture({ requestId }) {
        startedRequestIds.push(requestId);
      },
      cancelManualPasteCapture({ requestId }) {
        cancelledRequestIds.push(requestId);
      },
    },
  };
}
