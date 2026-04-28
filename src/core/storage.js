const STORAGE_KEY = "id-overlay/state";

export function createExtensionStorage() {
  const extensionApi = resolveExtensionApi();
  if (!extensionApi?.storage?.local) {
    return {
      async load() {
        return null;
      },
      async save() {}
    };
  }

  return {
    async load() {
      const record = await getFromStorage(extensionApi, STORAGE_KEY);
      return record?.[STORAGE_KEY] ?? null;
    },
    async save(state) {
      await setInStorage(extensionApi, {
        [STORAGE_KEY]: state
      });
    }
  };
}

function resolveExtensionApi() {
  if (globalThis.browser?.storage?.local) {
    return globalThis.browser;
  }
  if (globalThis.chrome?.storage?.local) {
    return globalThis.chrome;
  }
  return null;
}

function getFromStorage(extensionApi, key) {
  if (typeof extensionApi.storage.local.get === "function" && extensionApi.storage.local.get.length <= 1) {
    return extensionApi.storage.local.get(key);
  }
  return new Promise((resolve, reject) => {
    extensionApi.storage.local.get(key, (value) => {
      const error = globalThis.chrome?.runtime?.lastError;
      if (error) {
        reject(error);
        return;
      }
      resolve(value);
    });
  });
}

function setInStorage(extensionApi, record) {
  if (typeof extensionApi.storage.local.set === "function" && extensionApi.storage.local.set.length <= 1) {
    return extensionApi.storage.local.set(record);
  }
  return new Promise((resolve, reject) => {
    extensionApi.storage.local.set(record, () => {
      const error = globalThis.chrome?.runtime?.lastError;
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

