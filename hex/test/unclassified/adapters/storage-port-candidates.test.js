import test from "node:test";
import assert from "node:assert/strict";

import {
  createStoragePortAdapter,
} from "../../../adapters/extension/storage-port.js";

// Unclassified candidate: missing extension storage is not an application
// state shape. The adapter normalizes it to no durable state.
test("storage port normalizes missing state to null", async () => {
  for (const record of [undefined, null, {}, { "id-overlay/state": undefined }]) {
    const storage = createStoragePortAdapter({
      storageArea: {
        async get() {
          return record;
        },
      },
      storageKey: "id-overlay/state",
    });

    assert.equal(await storage.readDurableState(), null);
  }
});
