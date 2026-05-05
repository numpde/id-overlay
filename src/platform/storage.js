const STORAGE_KEY = "id-overlay/state";

export function createExtensionStorage() {
  // TODO(smell): The browser storage adapter still owns the app-specific
  // storage namespace. The final boundary should inject the key from
  // composition so platform storage is only browser/chrome mechanics.
  const storageLocal = resolveStorageLocal();
  if (!storageLocal) {
    return {
      async load() {
        return null;
      },
      async save() {}
    };
  }

  return {
    async load() {
      const record = await storageLocal.get(STORAGE_KEY);
      return record?.[STORAGE_KEY] ?? null;
    },
    async save(persistedSession) {
      await storageLocal.set({
        [STORAGE_KEY]: persistedSession
      });
    }
  };
}

function resolveStorageLocal() {
  if (globalThis.browser?.storage?.local) {
    return createPromiseStorageLocal(globalThis.browser.storage.local);
  }
  if (globalThis.chrome?.storage?.local) {
    return createCallbackStorageLocal(globalThis.chrome.storage.local, {
      getLastError: () => globalThis.chrome?.runtime?.lastError ?? null,
    });
  }
  return null;
}

function createPromiseStorageLocal(storageLocal) {
  return {
    get(key) {
      return storageLocal.get(key);
    },
    set(record) {
      return storageLocal.set(record);
    },
  };
}

function createCallbackStorageLocal(storageLocal, { getLastError }) {
  return {
    get(key) {
      return callCallbackStorageMethod(storageLocal, "get", key, { getLastError });
    },
    set(record) {
      return callCallbackStorageMethod(storageLocal, "set", record, { getLastError });
    },
  };
}

function callCallbackStorageMethod(storageLocal, methodName, argument, { getLastError }) {
  const method = storageLocal?.[methodName];
  return new Promise((resolve, reject) => {
    method.call(storageLocal, argument, (value) => {
      const error = getLastError();
      if (error) {
        reject(error);
        return;
      }
      resolve(value);
    });
  });
}
