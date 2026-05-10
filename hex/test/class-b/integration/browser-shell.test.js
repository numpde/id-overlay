import test from "node:test";
import assert from "node:assert/strict";

import {
  bootstrapBrowserExtension,
} from "../../../bootstrap/index.js";
import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "../../../application/command.js";

// Class-b, deliberately not class-a: the browser host harness is still
// provisional. The integration invariant is stable: repeated content bootstrap
// reuses one owned root/runtime instead of duplicating visible extension UI.
test("browser shell bootstrap is idempotent over one owned UI root", async () => {
  const host = createBrowserHostHarness({
    pageContext: {
      kind: "supported-map-editor-page",
    },
  });

  const first = await bootstrapBrowserExtension(host);
  const second = await bootstrapBrowserExtension(host);

  assert.equal(host.countOwnedRoots("id-overlay"), 1);
  assert.equal(first.runtime, second.runtime);
});

// Class-b, deliberately not class-a: unsupported-page UI policy might later add
// a small notice. The stable boundary is that unsupported pages expose no usable
// overlay controls and start no product runtime work.
test("browser shell does not expose usable overlay UI on unsupported pages", async () => {
  const host = createBrowserHostHarness({
    pageContext: {
      kind: "unsupported-page",
    },
  });

  const result = await bootstrapBrowserExtension(host);

  assert.equal(result.kind, "unsupported-page");
  assert.equal(host.countOwnedRoots("id-overlay"), 0);
  assert.equal(host.startedRuntimeCount, 0);
});

// Class-b, deliberately not class-a: the browser-shell composition path may
// grow as UI adapters come online. The stable integration claim is that startup
// crosses the port boundary once: durable storage is read by the shell, and the
// application is hydrated through its command interface rather than by bootstrap
// rebuilding product state.
test("browser shell hydrates the real application runtime from durable storage", async () => {
  const durableState = {
    session: {
      mode: "align",
      referenceImage: {
        imageDataRef: "reference-image-data-1",
        intrinsicSizePx: {
          width: 640,
          height: 480,
        },
      },
    },
  };
  const storage = createDurableStorageHarness({
    durableState,
  });
  const host = createBrowserHostHarness({
    pageContext: {
      kind: "supported-map-editor-page",
    },
    durableStatePort: storage.port,
  });

  const result = await bootstrapBrowserExtension(host);

  assert.equal(storage.readCount, 1);
  assert.deepEqual(result.runtime.getState(), {
    session: durableState.session,
  });
});

// Class-b, deliberately not class-a: the concrete persistence adapter may move
// closer to extension-specific code. The no-regret boundary is that persistence
// remains effect-driven; bootstrap wires the handler but does not decide what
// state is durable.
test("browser shell persists durable-state effects through the storage port", async () => {
  const durableState = {
    session: {
      mode: "align",
      referenceImage: {
        imageDataRef: "reference-image-data-1",
        intrinsicSizePx: {
          width: 640,
          height: 480,
        },
      },
    },
  };
  const storage = createDurableStorageHarness({
    durableState,
  });
  const host = createBrowserHostHarness({
    pageContext: {
      kind: "supported-map-editor-page",
    },
    durableStatePort: storage.port,
  });

  const result = await bootstrapBrowserExtension(host);
  await result.runtime.dispatch(createApplicationCommand(APPLICATION_COMMAND_KIND.SELECT_MODE, {
    mode: "trace",
  }));

  assert.deepEqual(storage.writes, [{
    session: {
      ...durableState.session,
      mode: "trace",
    },
  }]);
});

function createBrowserHostHarness({
  pageContext,
  durableStatePort = createDurableStorageHarness({ durableState: null }).port,
}) {
  const ownedRoots = new Map();
  return {
    pageContext,
    durableStatePort,
    startedRuntimeCount: 0,
    mountOwnedRoot(ownerId, root) {
      ownedRoots.set(ownerId, root);
    },
    countOwnedRoots(ownerId) {
      return ownedRoots.has(ownerId) ? 1 : 0;
    },
    startRuntime(runtime) {
      this.startedRuntimeCount += 1;
      return runtime;
    },
  };
}

function createDurableStorageHarness({ durableState }) {
  const writes = [];
  let readCount = 0;
  return {
    get readCount() {
      return readCount;
    },
    writes,
    port: {
      async readDurableState() {
        readCount += 1;
        return durableState;
      },
      async writeDurableState(nextDurableState) {
        writes.push(nextDurableState);
      },
    },
  };
}
