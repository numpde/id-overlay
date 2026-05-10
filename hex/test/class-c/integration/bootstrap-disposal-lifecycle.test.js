import test from "node:test";
import assert from "node:assert/strict";

import {
  bootstrapBrowserExtension,
} from "../../../bootstrap/index.js";

// Class-c: runtime disposal is already class-a, but bootstrap disposal is not
// implemented. This test is quarantined design pressure for the shell boundary:
// repeated bootstrap should not duplicate input listeners, and disposal should
// tear those listener subscriptions down exactly once.
test("repeated bootstrap binds input listeners once and disposal removes them", async () => {
  const input = createInputBindingHarness();
  const host = createBrowserHostHarness({
    inputBindingPort: input.port,
  });

  const first = await bootstrapBrowserExtension(host);
  const second = await bootstrapBrowserExtension(host);
  first.dispose();
  first.dispose();

  assert.equal(first, second);
  assert.equal(input.bindCount, 1);
  assert.equal(input.disposeCount, 1);
});

// Class-c: late runtime effect disposal is class-a, but late shell-side effects
// are still not wired. Promote only after clipboard/image input lives behind a
// cancellable shell effect boundary instead of ad hoc bootstrap callbacks.
test("disposal prevents late shell effects from rendering or persisting", async () => {
  const read = createDeferred();
  const storage = createDurableStorageHarness({
    durableState: null,
  });
  const host = createBrowserHostHarness({
    durableStatePort: storage.port,
    clipboardImagePort: {
      async readReferenceImage() {
        return read.promise;
      },
    },
  });

  const bootstrap = await bootstrapBrowserExtension(host);
  const paste = host.latestRender.dispatchCommand({
    kind: "activate-primary-action",
  });
  bootstrap.dispose();
  read.resolve({
    kind: "accepted",
    referenceImage: normalizedReferenceImage(),
  });
  await paste;

  assert.deepEqual(storage.writes, []);
  assert.equal(host.renderCount, 1);
});

function createBrowserHostHarness({
  durableStatePort = createDurableStorageHarness({ durableState: null }).port,
  clipboardImagePort = null,
  inputBindingPort = createInputBindingHarness().port,
} = {}) {
  return {
    pageContext: {
      kind: "supported-map-editor-page",
    },
    durableStatePort,
    clipboardImagePort,
    inputBindingPort,
    latestRender: null,
    renderCount: 0,
    mountOwnedRoot(ownerId, root) {
      return {
        ...root,
        ownerId,
      };
    },
    renderApplicationView(render) {
      this.renderCount += 1;
      this.latestRender = render;
    },
    startRuntime(runtime) {
      return runtime;
    },
  };
}

function createInputBindingHarness() {
  let bindCount = 0;
  let disposeCount = 0;
  return {
    get bindCount() {
      return bindCount;
    },
    get disposeCount() {
      return disposeCount;
    },
    port: {
      bindInput() {
        bindCount += 1;
        return () => {
          disposeCount += 1;
        };
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

function createDeferred() {
  let resolve;
  return {
    promise: new Promise((resolver) => {
      resolve = resolver;
    }),
    resolve,
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
