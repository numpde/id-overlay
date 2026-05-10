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

// Unclassified: this is browser-shell lifecycle, not product state. The target
// is important for real tabs: idempotence is per host, but two hosts must never
// share runtime state, roots, or storage side effects through a global singleton.
test("candidate: separate browser hosts own separate runtimes, roots, and persistence", async () => {
  const firstStorage = createDurableStorageHarness({
    durableState: durableImageState({
      mode: "align",
    }),
  });
  const secondStorage = createDurableStorageHarness({
    durableState: durableImageState({
      mode: "align",
    }),
  });
  const firstHost = createBrowserHostHarness({
    durableStatePort: firstStorage.port,
  });
  const secondHost = createBrowserHostHarness({
    durableStatePort: secondStorage.port,
  });

  const first = await bootstrapBrowserExtension(firstHost);
  const second = await bootstrapBrowserExtension(secondHost);
  await firstHost.latestRender.dispatchCommand({
    kind: "select-mode",
    mode: "trace",
  });

  assert.notEqual(first.runtime, second.runtime);
  assert.equal(firstHost.countOwnedRoots("id-overlay"), 1);
  assert.equal(secondHost.countOwnedRoots("id-overlay"), 1);
  assert.equal(firstHost.latestRender.view.mode, "trace");
  assert.equal(secondHost.latestRender.view.mode, "align");
  assert.deepEqual(firstStorage.writes, [durableImageState({
    mode: "trace",
  })]);
  assert.deepEqual(secondStorage.writes, []);
});
