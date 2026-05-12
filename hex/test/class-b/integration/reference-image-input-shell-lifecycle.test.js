import test from "node:test";
import assert from "node:assert/strict";

import {
  bootstrapBrowserExtension,
} from "../../../bootstrap/index.js";

// Class-b: this is the stable shell boundary, but still tested with a bootstrap
// harness rather than a real browser adapter. The application owns semantic
// request correlation; bootstrap merely routes the effect through one input
// port. Clipboard, manual paste, file input, and drag/drop remain tactics behind
// that port, not separate product paths in bootstrap.
test("browser shell starts reference-image input and reports accepted outcome", async () => {
  const referenceImage = normalizedReferenceImage();
  const storage = createDurableStorageHarness({
    durableState: null,
  });
  const input = createReferenceImageInputHarness();
  const host = createBrowserHostHarness({
    durableStatePort: storage.port,
    referenceImageInputPort: input.port,
  });

  const result = await bootstrapBrowserExtension(host);
  await host.latestRender.dispatchCommand({
    kind: "activate-primary-action",
  });

  assert.deepEqual(input.starts, [{
    requestId: 1,
    intent: {
      kind: "load-reference-image",
    },
  }]);

  await input.reportOutcome(1, {
    kind: "accepted",
    referenceImage,
  });

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

// Class-b: cancellation has two owners. The app owns the product fact that the
// request ended; the shell owns host-resource cleanup for the matching request.
// The request id is the only coupling allowed between those two responsibilities.
test("browser shell cancels reference-image input and late outcomes stay inert", async () => {
  const storage = createDurableStorageHarness({
    durableState: null,
  });
  const input = createReferenceImageInputHarness();
  const host = createBrowserHostHarness({
    durableStatePort: storage.port,
    referenceImageInputPort: input.port,
  });

  const result = await bootstrapBrowserExtension(host);
  await host.latestRender.dispatchCommand({
    kind: "activate-primary-action",
  });
  await host.latestRender.dispatchCommand({
    kind: "activate-primary-action",
  });

  assert.deepEqual(input.cancellations, [{
    requestId: 1,
  }]);

  await input.reportOutcome(1, {
    kind: "accepted",
    referenceImage: normalizedReferenceImage(),
  });

  assert.deepEqual(result.runtime.getState(), {
    notice: {
      kind: "reference-image-input-cancelled",
      requestId: 1,
    },
  });
  assert.deepEqual(storage.writes, []);
});

function createBrowserHostHarness({
  durableStatePort,
  referenceImageInputPort,
}) {
  return {
    pageContext: {
      kind: "supported-map-editor-page",
    },
    durableStatePort,
    referenceImageInputPort,
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

function createReferenceImageInputHarness() {
  const starts = [];
  const cancellations = [];
  const reporters = new Map();
  return {
    starts,
    cancellations,
    async reportOutcome(requestId, outcome) {
      await reporters.get(requestId)?.(outcome);
    },
    port: {
      startReferenceImageInput({ requestId, intent, reportOutcome }) {
        starts.push({
          requestId,
          intent,
        });
        reporters.set(requestId, reportOutcome);
      },
      cancelReferenceImageInput({ requestId }) {
        cancellations.push({
          requestId,
        });
      },
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

function normalizedReferenceImage() {
  return {
    imageDataRef: "reference-image-data-1",
    intrinsicSizePx: {
      width: 640,
      height: 480,
    },
  };
}
