import test from "node:test";
import assert from "node:assert/strict";

import {
  createStoragePortAdapter,
} from "../../../adapters/extension/storage-port.js";

// Unclassified candidate: persistence is an adapter concern, but the adapter
// must store only the durable projection selected by the application.
test("storage port stores exactly durable state", async () => {
  const writes = [];
  const storage = createStoragePortAdapter({
    storageArea: {
      async set(record) {
        writes.push(record);
      },
    },
    storageKey: "id-overlay/state",
  });
  const durableState = {
    session: {
      mode: "align",
    },
  };

  await storage.writeDurableState(durableState);
  await storage.writeDurableState(null);

  assert.deepEqual(writes, [
    {
      "id-overlay/state": durableState,
    },
    {
      "id-overlay/state": null,
    },
  ]);
});

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
