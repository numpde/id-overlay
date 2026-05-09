export function createExtensionStorage({
  storageKey,
} = {}) {
  if (typeof storageKey !== "string" || !storageKey) {
    throw new TypeError("createExtensionStorage requires a storageKey.");
  }
  const storageLocal = resolveStorageLocal();
  if (!storageLocal) {
    return {
      async load() {
        return null;
      },
      async save() {},
    };
  }

  return {
    async load() {
      const record = await storageLocal.get(storageKey);
      return record?.[storageKey] ?? null;
    },
    async save(persistedSession) {
      await storageLocal.set({
        [storageKey]: persistedSession,
      });
    },
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
