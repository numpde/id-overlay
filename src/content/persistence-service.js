import { createExtensionStorage } from "../platform/storage.js";
import { DEFAULT_STORAGE_KEY } from "../platform/storage-key.js";

export function createContentPersistenceService({
  storage = createExtensionStorage({ storageKey: DEFAULT_STORAGE_KEY }),
} = {}) {
  return {
    loadPersistedSession,
    savePersistedSession,
  };

  function loadPersistedSession() {
    return storage.load();
  }

  function savePersistedSession(session) {
    return storage.save(session);
  }
}
