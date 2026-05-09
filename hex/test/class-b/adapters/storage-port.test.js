import test from "node:test";
import assert from "node:assert/strict";

import {
  createStoragePortAdapter,
} from "../../../adapters/extension/storage-port.js";

// Class-b: persistence is an adapter concern, but the adapter must store only
// the durable projection selected by the application.
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
