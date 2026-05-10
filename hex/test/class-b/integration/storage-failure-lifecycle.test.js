import test from "node:test";
import assert from "node:assert/strict";

import {
  bootstrapBrowserExtension,
} from "../../../bootstrap/index.js";

// Class-b, deliberately not class-a: storage is a browser-shell adapter. The
// retry/backoff UX can change, but the no-regret boundary is fixed: read failure
// is reported outside the product reducer and falls back to the canonical empty
// UI instead of making the extension disappear.
test("startup storage read failure reports an error and renders empty UI", async () => {
  const readError = new Error("storage read exploded");
  const storage = createDurableStorageHarness({
    durableState: null,
    readError,
  });
  const host = createBrowserHostHarness({
    durableStatePort: storage.port,
  });

  const result = await bootstrapBrowserExtension(host);

  assert.deepEqual(result.runtime.getState(), {});
  assert.equal(host.latestRender.view.primaryAction.label, "Paste");
  assert.deepEqual(host.reportedErrors, [readError]);
});

// Class-b, deliberately not class-a: persistence failure is adapter failure, not
// product veto. The command has already changed in-memory state; the shell must
// report the failed write separately and keep rendering later valid commands.
test("storage write failure is reported without killing later renders", async () => {
  const writeError = new Error("storage write exploded");
  const storage = createDurableStorageHarness({
    durableState: durableImageState({
      mode: "align",
    }),
    writeError,
  });
  const host = createBrowserHostHarness({
    durableStatePort: storage.port,
  });

  await bootstrapBrowserExtension(host);
  await host.latestRender.dispatchCommand({
    kind: "select-mode",
    mode: "trace",
  });
  await host.latestRender.dispatchCommand({
    kind: "select-mode",
    mode: "trace",
  });

  assert.equal(host.latestRender.view.mode, "trace");
  assert.deepEqual(host.reportedErrors, [writeError]);
});

function createBrowserHostHarness({
  durableStatePort,
}) {
  const reportedErrors = [];
  return {
    pageContext: {
      kind: "supported-map-editor-page",
    },
    durableStatePort,
    reportedErrors,
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
    reportRuntimeError(error) {
      reportedErrors.push(error);
    },
    startRuntime(runtime) {
      return runtime;
    },
  };
}

function createDurableStorageHarness({
  durableState,
  readError = null,
  writeError = null,
}) {
  return {
    port: {
      async readDurableState() {
        if (readError) {
          throw readError;
        }
        return durableState;
      },
      async writeDurableState() {
        if (writeError) {
          throw writeError;
        }
      },
    },
  };
}

function durableImageState({ mode }) {
  return {
    session: {
      mode,
      referenceImage: {
        imageDataRef: "data:image/png;base64,reference-image",
        intrinsicSizePx: {
          width: 640,
          height: 480,
        },
      },
    },
  };
}
