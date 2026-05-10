import test from "node:test";
import assert from "node:assert/strict";

import {
  bootstrapBrowserExtension,
} from "../../../bootstrap/index.js";

// Class-c: this encodes the desired clipboard failure taxonomy, but the shell
// does not yet have the manual-paste effect boundary needed to make the test a
// fair class-b integration contract. Keep it quarantined until direct clipboard
// failure, manual fallback, and status copy are wired as one flow.
test("clipboard-api unavailable starts manual paste capture instead of failing", async () => {
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

// Class-c: failure reason strings are too loose to promote. The final version
// should probably use a closed failure vocabulary before this becomes class-b.
test("missing and unreadable clipboard images render distinct notices", async () => {
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

function createBrowserHostHarness({
  durableStatePort = createDurableStorageHarness({
    durableState: null,
  }).port,
  clipboardImagePort = createClipboardImageHarness().port,
  manualPasteCapturePort = null,
} = {}) {
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
  readReferenceImageResults = [{
    kind: "empty",
  }],
} = {}) {
  let readReferenceImageCount = 0;
  return {
    get readReferenceImageCount() {
      return readReferenceImageCount;
    },
    port: {
      async readReferenceImage() {
        const result = readReferenceImageResults[readReferenceImageCount]
          ?? readReferenceImageResults.at(-1);
        readReferenceImageCount += 1;
        return result;
      },
    },
  };
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
