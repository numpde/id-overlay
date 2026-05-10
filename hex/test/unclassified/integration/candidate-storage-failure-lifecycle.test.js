import test from "node:test";
import assert from "node:assert/strict";

import {
  bootstrapBrowserExtension,
} from "../../../bootstrap/index.js";
import {
  createBrowserHostHarness,
  createDurableStorageHarness,
  durableImageState,
} from "./candidate-browser-harness.js";

// Unclassified: exact retry/backoff policy is not designed yet. The first-class
// error boundary is: storage failure is an adapter failure, not permission to
// make the extension disappear or corrupt in-memory app state.
test("candidate: startup storage read failure reports an error and renders empty UI", async () => {
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

// Unclassified: losing a write should not roll back the visible command. The
// user changed mode; persistence failure is reported separately so the runtime
// can keep accepting later commands.
test("candidate: storage write failure is reported without killing later renders", async () => {
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
