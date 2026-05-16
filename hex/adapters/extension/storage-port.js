export function createStoragePortAdapter({ storageArea, storageKey }) {
  return {
    async writeDurableState(durableState) {
      await callStorage({
        method: storageArea.set.bind(storageArea),
        args: [{
          [storageKey]: durableState,
        }],
      });
    },
    async readDurableState() {
      const record = await callStorage({
        method: storageArea.get.bind(storageArea),
        args: [storageKey],
      });
      return record?.[storageKey] ?? null;
    },
  };
}

function callStorage({ method, args }) {
  if (method.length > args.length) {
    return new Promise((resolve, reject) => {
      method(...args, (result) => {
        const error = globalThis.chrome?.runtime?.lastError;
        if (error) {
          reject(error);
          return;
        }
        resolve(result);
      });
    });
  }
  return method(...args);
}
