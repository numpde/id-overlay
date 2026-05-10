import test from "node:test";
import assert from "node:assert/strict";

import {
  bootstrapBrowserExtension,
} from "../../../bootstrap/index.js";

// Unclassified: history laws are class-a at the reducer. This candidate checks
// the composed UI loop: panel history controls must advertise semantic labels,
// undo must restore visible image state, and redo must remove it again.
test("candidate: clear-image undo and redo re-render overlay and persist replayed durable state", async () => {
  const referenceImage = normalizedReferenceImage();
  const storage = createDurableStorageHarness({
    durableState: durableImageState({
      mode: "align",
      referenceImage,
    }),
  });
  const host = createBrowserHostHarness({
    durableStatePort: storage.port,
  });

  await bootstrapBrowserExtension(host);
  await host.latestRender.dispatchCommand({
    kind: "activate-primary-action",
  });
  await host.latestRender.dispatchCommand({
    kind: "activate-primary-action",
  });

  assert.equal(host.latestRender.view.overlay.visible, false);
  assert.deepEqual(host.latestRender.view.history.undo, {
    enabled: true,
    label: "Reload image",
  });

  await host.latestRender.dispatchCommand({
    kind: "undo",
  });
  assert.equal(host.latestRender.view.overlay.visible, true);
  assert.deepEqual(host.latestRender.view.history.redo, {
    enabled: true,
    label: "Remove image",
  });

  await host.latestRender.dispatchCommand({
    kind: "redo",
  });
  assert.equal(host.latestRender.view.overlay.visible, false);
  assert.deepEqual(storage.writes, [
    null,
    durableImageState({
      mode: "align",
      referenceImage,
    }),
    null,
  ]);
});

// Unclassified: status copy is currently class-b view-model policy. The
// composed shell still needs to prove that transient notices are visible after
// runtime results and disappear when a later successful image lifecycle starts.
test("candidate: empty paste status is visible and successful image load clears it", async () => {
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
