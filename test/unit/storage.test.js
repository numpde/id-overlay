import test from "node:test";
import assert from "node:assert/strict";

import { createExtensionStorage } from "../../src/platform/storage.js";

const PERSISTED_SESSION = Object.freeze({
  mode: "align",
  opacity: 0.75,
  image: Object.freeze({
    src: "data:image/png;base64,abc",
    width: 800,
    height: 400,
  }),
  placement: Object.freeze({
    type: "similarity",
    a: 1,
    b: 0,
    tx: 10,
    ty: 20,
    scale: 1,
    rotationRad: 0,
  }),
  registration: Object.freeze({
    pins: Object.freeze([
      Object.freeze({
        id: 1,
        imagePx: Object.freeze({ x: 400, y: 200 }),
        mapLatLon: Object.freeze({ lat: -1.23, lon: 36.84 }),
      }),
    ]),
    solvedTransform: null,
    dirty: true,
  }),
});

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
    const storage = createExtensionStorage({ storageKey: "id-overlay/state" });
    assert.equal(await storage.load(), null);
    await storage.save(PERSISTED_SESSION);
    assert.deepEqual(await storage.load(), PERSISTED_SESSION);
  } finally {
    if (previousChrome === undefined) {
      delete globalThis.chrome;
    } else {
      globalThis.chrome = previousChrome;
    }
  }
});

test("storage wrapper loads and saves with promise-style browser storage", async () => {
  const previousBrowser = globalThis.browser;
  const records = {};
  globalThis.browser = {
    storage: {
      local: {
        async get(key) {
          return { [key]: records[key] ?? null };
        },
        async set(record) {
          Object.assign(records, record);
        },
      },
    },
  };

  try {
    const storage = createExtensionStorage({ storageKey: "id-overlay/state" });
    assert.equal(await storage.load(), null);
    await storage.save(PERSISTED_SESSION);
    assert.deepEqual(await storage.load(), PERSISTED_SESSION);
  } finally {
    if (previousBrowser === undefined) {
      delete globalThis.browser;
    } else {
      globalThis.browser = previousBrowser;
    }
  }
});

test("storage wrapper accepts an injected storage key", async () => {
  const previousBrowser = globalThis.browser;
  const records = {};
  globalThis.browser = {
    storage: {
      local: {
        async get(key) {
          return { [key]: records[key] ?? null };
        },
        async set(record) {
          Object.assign(records, record);
        },
      },
    },
  };

  try {
    const storage = createExtensionStorage({ storageKey: "custom/session" });
    await storage.save(PERSISTED_SESSION);

    assert.deepEqual(records, {
      "custom/session": PERSISTED_SESSION,
    });
    assert.deepEqual(await storage.load(), PERSISTED_SESSION);
  } finally {
    if (previousBrowser === undefined) {
      delete globalThis.browser;
    } else {
      globalThis.browser = previousBrowser;
    }
  }
});

test("storage wrapper requires composition to provide the storage key", () => {
  assert.throws(
    () => createExtensionStorage({ storageKey: "" }),
    /storageKey/,
  );
});

test("storage wrapper rejects callback-style chrome errors", async () => {
  const previousChrome = globalThis.chrome;
  globalThis.chrome = {
    runtime: {
      lastError: null,
    },
    storage: {
      local: {
        get(_key, callback) {
          globalThis.chrome.runtime.lastError = new Error("storage failed");
          callback(undefined);
          globalThis.chrome.runtime.lastError = null;
        },
      },
    },
  };

  try {
    const storage = createExtensionStorage({ storageKey: "id-overlay/state" });
    await assert.rejects(
      storage.load(),
      /storage failed/,
    );
  } finally {
    if (previousChrome === undefined) {
      delete globalThis.chrome;
    } else {
      globalThis.chrome = previousChrome;
    }
  }
});
