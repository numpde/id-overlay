import test from "node:test";
import assert from "node:assert/strict";

import {
  bootstrapBrowserExtension,
} from "../../../bootstrap/index.js";

// Class-b, deliberately not class-a: unsupported-page detection is browser-shell
// policy. The stable contract is stricter than "no visible UI": unsupported
// pages must not read storage, mount roots, start runtime work, render, or bind
// input listeners.
test("unsupported page performs no extension host work", async () => {
  const calls = [];
  const result = await bootstrapBrowserExtension({
    pageContext: {
      kind: "unsupported-page",
    },
    durableStatePort: {
      async readDurableState() {
        calls.push("read-durable-state");
        return null;
      },
      async writeDurableState() {
        calls.push("write-durable-state");
      },
    },
    mountOwnedRoot() {
      calls.push("mount-owned-root");
    },
    renderApplicationView() {
      calls.push("render-application-view");
    },
    startRuntime() {
      calls.push("start-runtime");
    },
    bindInputListeners() {
      calls.push("bind-input-listeners");
    },
  });

  assert.deepEqual(result, {
    kind: "unsupported-page",
  });
  assert.deepEqual(calls, []);
});
