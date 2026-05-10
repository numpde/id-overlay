import test from "node:test";
import assert from "node:assert/strict";

import {
  bootstrapBrowserExtension,
} from "../../../bootstrap/index.js";

// Class-b, not class-a: the browser host harness is still provisional. The
// lifecycle invariant is stable enough: repeated content bootstrap must reuse
// one owned root/runtime instead of duplicating visible extension UI.
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

function createBrowserHostHarness({ pageContext }) {
  const ownedRoots = new Map();
  return {
    pageContext,
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
