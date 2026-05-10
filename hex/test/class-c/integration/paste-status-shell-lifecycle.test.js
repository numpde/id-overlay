import test from "node:test";
import assert from "node:assert/strict";

import {
  bootstrapBrowserExtension,
} from "../../../bootstrap/index.js";

// Class-c: status copy and paste outcome semantics are covered at the
// application/view-model boundary. This composed shell scenario still smuggles
// in a browser workflow: primary action would have to arm paste, a clipboard
// adapter would have to report a correlated outcome command, and the shell would
// re-render the resulting status. Promote only when that effect boundary exists;
// do not teach primary action itself to read the clipboard.
test("empty paste status is visible and successful image load clears it", async () => {
  const referenceImage = normalizedReferenceImage();
  const storage = createDurableStorageHarness({
    durableState: null,
  });
  const clipboard = createClipboardImageHarness({
    readReferenceImageResults: [
      {
        kind: "empty",
      },
      {
        kind: "accepted",
        referenceImage,
      },
    ],
  });
  const host = createBrowserHostHarness({
    durableStatePort: storage.port,
    clipboardImagePort: clipboard.port,
  });

  await bootstrapBrowserExtension(host);
  await host.latestRender.dispatchCommand({
    kind: "activate-primary-action",
  });
  assert.equal(host.latestRender.view.status, "Clipboard does not contain an image.");
  assert.equal(host.latestRender.view.overlay.visible, false);

  await host.latestRender.dispatchCommand({
    kind: "activate-primary-action",
  });
  assert.equal(host.latestRender.view.status, "Loaded screenshot 640x480.");
  assert.equal(host.latestRender.view.overlay.visible, true);
  assert.deepEqual(storage.writes, [durableImageState({
    mode: "align",
    referenceImage,
  })]);
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
  const pending = [...readReferenceImageResults];
  return {
    port: {
      async readReferenceImage() {
        return pending.shift() ?? {
          kind: "empty",
        };
      },
    },
  };
}

function durableImageState({ mode, referenceImage }) {
  return {
    session: {
      mode,
      referenceImage,
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
