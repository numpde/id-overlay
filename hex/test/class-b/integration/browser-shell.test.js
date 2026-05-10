import test from "node:test";
import assert from "node:assert/strict";

import {
  bootstrapBrowserExtension,
} from "../../../bootstrap/index.js";

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

// Class-b, not class-a: unsupported-page UI policy might later include a small
// notice, but it must not expose usable overlay controls or start product
// runtime work where the page adapter cannot operate.
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
