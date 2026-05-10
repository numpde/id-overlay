import test from "node:test";
import assert from "node:assert/strict";

import {
  bootstrapBrowserExtension,
} from "../../../bootstrap/index.js";

// Unclassified: this is the intended composed user flow, not yet settled as a
// class-b browser-shell contract. It should be promoted only after the concrete
// port names and manual-paste fallback shape are implemented without smuggling
// clipboard mechanics into the application.
test("candidate: primary Paste reads clipboard image, renders overlay, and persists session", async () => {
  const referenceImage = normalizedReferenceImage();
  const storage = createDurableStorageHarness({
    durableState: null,
  });
  const clipboard = createClipboardImageHarness({
    readReferenceImageResult: {
      kind: "accepted",
      referenceImage,
    },
  });
  const host = createBrowserHostHarness({
    durableStatePort: storage.port,
    clipboardImagePort: clipboard.port,
  });

  const result = await bootstrapBrowserExtension(host);
  await host.latestRender.dispatchCommand({
    kind: "activate-primary-action",
  });

  assert.equal(clipboard.readReferenceImageCount, 1);
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
  assert.deepEqual(host.latestRender.view.overlay, {
    visible: true,
    imageDataRef: referenceImage.imageDataRef,
    intrinsicSizePx: referenceImage.intrinsicSizePx,
    placement: null,
    opacity: 1,
    pins: [],
  });
});

// Unclassified: legacy supported manual paste after Clipboard API failure. The
// durable principle is source convergence: browser input source must not fork
// product semantics once an image handle has been normalized.
test("candidate: paste-event image input uses the same accepted-image lifecycle", async () => {
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
  const host = createBrowserHostHarness({
    durableStatePort: storage.port,
    clipboardImagePort: clipboard.port,
  });

  const result = await bootstrapBrowserExtension(host);
  await host.latestRender.dispatchCommand({
    kind: "activate-primary-action",
  });
  await host.dispatchPasteImageHandle({
    runtimeHandle: "manual-paste-image",
  });

  assert.equal(clipboard.readReferenceImageCount, 1);
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

// Unclassified: this is already mostly covered in application tests. The missing
// composed claim is visible lifecycle closure: the browser shell must re-render
// from no-session view after persistence clears durable image state.
test("candidate: clearing image removes visible overlay and persists null", async () => {
  const referenceImage = normalizedReferenceImage();
  const storage = createDurableStorageHarness({
    durableState: {
      session: {
        mode: "align",
        referenceImage,
      },
    },
  });
  const host = createBrowserHostHarness({
    durableStatePort: storage.port,
  });

  const result = await bootstrapBrowserExtension(host);
  assert.equal(host.latestRender.view.overlay.visible, true);

  await host.latestRender.dispatchCommand({
    kind: "activate-primary-action",
  });
  await host.latestRender.dispatchCommand({
    kind: "activate-primary-action",
  });

  assert.deepEqual(result.runtime.getState(), {
    history: {
      past: [{
        kind: "remove-reference-image",
        undoLabel: "Reload image",
        redoLabel: "Remove image",
        before: {
          session: {
            mode: "align",
            referenceImage,
          },
        },
        after: null,
      }],
      future: [],
    },
  });
  assert.equal(host.latestRender.view.overlay.visible, false);
  assert.deepEqual(storage.writes, [null]);
});

// Unclassified: hydration already has class-a application coverage. This
// candidate freezes the browser-visible half: a stored image session should be
// rendered on startup without a fresh clipboard read.
test("candidate: startup hydration renders stored reference image without rereading clipboard", async () => {
  const referenceImage = normalizedReferenceImage();
  const storage = createDurableStorageHarness({
    durableState: {
      session: {
        mode: "trace",
        referenceImage,
        opacity: 0.75,
      },
    },
  });
  const clipboard = createClipboardImageHarness({
    readReferenceImageResult: {
      kind: "accepted",
      referenceImage,
    },
  });
  const host = createBrowserHostHarness({
    durableStatePort: storage.port,
    clipboardImagePort: clipboard.port,
  });

  await bootstrapBrowserExtension(host);

  assert.equal(clipboard.readReferenceImageCount, 0);
  assert.deepEqual(host.latestRender.view.overlay, {
    visible: true,
    imageDataRef: referenceImage.imageDataRef,
    intrinsicSizePx: referenceImage.intrinsicSizePx,
    placement: null,
    opacity: 0.75,
    pins: [],
  });
  assert.deepEqual(storage.writes, []);
});

// Unclassified: empty clipboard is a normal user-world outcome. The composed
// shell must show the application notice, keep no overlay session, and avoid
// durable writes.
test("candidate: empty clipboard result renders notice without durable image state", async () => {
  const storage = createDurableStorageHarness({
    durableState: null,
  });
  const clipboard = createClipboardImageHarness({
    readReferenceImageResult: {
      kind: "empty",
    },
  });
  const host = createBrowserHostHarness({
    durableStatePort: storage.port,
    clipboardImagePort: clipboard.port,
  });

  const result = await bootstrapBrowserExtension(host);
  await host.latestRender.dispatchCommand({
    kind: "activate-primary-action",
  });

  assert.equal(clipboard.readReferenceImageCount, 1);
  assert.equal(result.runtime.getState().session, undefined);
  assert.equal(host.latestRender.view.overlay.visible, false);
  assert.equal(host.latestRender.view.status, "Clipboard does not contain an image.");
  assert.deepEqual(storage.writes, []);
});

function createBrowserHostHarness({
  durableStatePort,
  clipboardImagePort = createClipboardImageHarness().port,
}) {
  return {
    pageContext: {
      kind: "supported-map-editor-page",
    },
    durableStatePort,
    clipboardImagePort,
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
    async dispatchPasteImageHandle(imageHandle) {
      await this.latestRender.dispatchCommand({
        kind: "reference-image-paste-event",
        imageHandle,
      });
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
  readReferenceImageResult = {
    kind: "empty",
  },
  readReferenceImageFromPasteEventResult = readReferenceImageResult,
} = {}) {
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

function normalizedReferenceImage() {
  return {
    imageDataRef: "data:image/png;base64,reference-image",
    intrinsicSizePx: {
      width: 640,
      height: 480,
    },
  };
}
