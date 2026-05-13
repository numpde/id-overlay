import test from "node:test";
import assert from "node:assert/strict";

import {
  bootstrapBrowserExtension,
} from "../../../bootstrap/index.js";

// Unclassified candidate: the user behavior is stable, but this test still combines three
// unsettled boundary choices: `manualPasteCapturePort`, a direct clipboard
// `unavailable` outcome, and request ids owned by bootstrap. A class-b version
// should say "Paste cannot read directly, then manual paste remains armed" via
// a browser/user harness rather than naming the shell port shape.
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

// Unclassified candidate: distinct user notices are stable, but stringly failure reasons and
// the ad hoc `source` field are not. Promote after paste failure crosses the app
// boundary as closed plain-data vocabulary selected by a tested adapter.
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
