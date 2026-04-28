import test from "node:test";
import assert from "node:assert/strict";

import { createExtensionStorage } from "../../src/core/storage.js";

test("storage wrapper loads and saves with callback-style chrome storage", async () => {
  const previousChrome = globalThis.chrome;
  const records = {};
  globalThis.chrome = {
    runtime: {
      lastError: null,
    },
    storage: {
      local: {
        get(key, callback) {
          callback({ [key]: records[key] ?? null });
        },
        set(record, callback) {
          Object.assign(records, record);
          callback();
        },
      },
    },
  };

  try {
    const storage = createExtensionStorage();
    assert.equal(await storage.load(), null);
    await storage.save({ mode: "trace" });
    assert.deepEqual(await storage.load(), { mode: "trace" });
  } finally {
    if (previousChrome === undefined) {
      delete globalThis.chrome;
    } else {
      globalThis.chrome = previousChrome;
    }
  }
});

