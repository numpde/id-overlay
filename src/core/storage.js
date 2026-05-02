const STORAGE_KEY = "id-overlay/state";

export function createExtensionStorage() {
  // Final semantic-history shape: storage is an opaque persistence adapter. It
  // should store the explicit durable schema it is given, not know about UI
  // transition records unless persistence intentionally includes them.
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
      const record = await callStorageLocalMethod(extensionApi, "get", STORAGE_KEY);
      return record?.[STORAGE_KEY] ?? null;
    },
    async save(state) {
      // Final semantic-history shape: callers should pass a durable projection
      // here. Avoid saving live runtime, panel intent, or accidental store
      // internals through this generic adapter.
      await callStorageLocalMethod(extensionApi, "set", {
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

function callStorageLocalMethod(extensionApi, methodName, argument) {
  const method = extensionApi.storage.local[methodName];
  if (typeof method === "function" && method.length <= 1) {
    return method.call(extensionApi.storage.local, argument);
  }
  return new Promise((resolve, reject) => {
    method.call(extensionApi.storage.local, argument, (value) => {
      const error = globalThis.chrome?.runtime?.lastError;
      if (error) {
        reject(error);
        return;
      }
      resolve(value);
    });
  });
}
