export function createStoragePortAdapter({ storageArea, storageKey }) {
  return {
    async writeDurableState(durableState) {
      await storageArea.set({
        [storageKey]: durableState,
      });
    },
    async readDurableState() {
      const record = await storageArea.get(storageKey);
      return record?.[storageKey] ?? null;
    },
  };
}
