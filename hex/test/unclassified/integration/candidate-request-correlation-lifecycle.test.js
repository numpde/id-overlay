import test from "node:test";
import assert from "node:assert/strict";

import {
  bootstrapBrowserExtension,
} from "../../../bootstrap/index.js";

// Unclassified: request-correlation is class-a in the reducer. This candidate
// lifts that law to the composed shell: request ids must survive async clipboard
// work so a late first result cannot overwrite a newer accepted image.
test("candidate: late clipboard result from an earlier paste request is ignored", async () => {
  const firstRead = createDeferred();
  const secondRead = createDeferred();
  const firstImage = normalizedReferenceImage("first");
  const secondImage = normalizedReferenceImage("second");
  const storage = createDurableStorageHarness({
    durableState: null,
  });
  const clipboard = createDeferredClipboardHarness([
    firstRead.promise,
    secondRead.promise,
  ]);
  const host = createBrowserHostHarness({
    durableStatePort: storage.port,
    clipboardImagePort: clipboard.port,
  });

  const result = await bootstrapBrowserExtension(host);
  const firstDispatch = host.latestRender.dispatchCommand({
    kind: "activate-primary-action",
  });
  await flushMicrotasks();
  await host.latestRender.dispatchCommand({
    kind: "activate-primary-action",
  });
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

  assert.equal(clipboard.readCount, 2);
  assert.deepEqual(result.runtime.getState().session.referenceImage, secondImage);
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

function createDeferredClipboardHarness(readResults) {
  let readCount = 0;
  return {
    get readCount() {
      return readCount;
    },
    port: {
      async readReferenceImage() {
        const result = readResults[readCount];
        readCount += 1;
        return result;
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
