import test from "node:test";
import assert from "node:assert/strict";

import {
  bootstrapBrowserExtension,
} from "../../../bootstrap/index.js";

// Unclassified candidate: the behavior is stable, but this test is still too
// coupled to an imagined bootstrap API. A promotable version should speak in
// browser-lifecycle terms such as "start the extension twice" and "unload the
// extension once", not in terms of `inputBindingPort` or the exact returned
// `dispose` method.
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

// Unclassified candidate: the observable contract is stable: stopping the
// extension must make late async browser work unable to render or persist. The
// current test still bakes in a speculative clipboard port and bootstrap
// `dispose` shape, so keep it unclassified until a user/browser harness can
// express stop-and-late-result.
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
