import {
  toPersistedMachineSessionSnapshot,
} from "./persistence.js";

export function createMachineHostPersistenceService({
  initialState = null,
  savePersistedSession = null,
  reportError = null,
} = {}) {
  let lastPersistedKey = toPersistedMachineSessionSnapshot(initialState).key;

  function persistCommittedResult(result) {
    const snapshot = toPersistedMachineSessionSnapshot(result?.state);
    if (snapshot.key === lastPersistedKey) {
      return;
    }
    lastPersistedKey = snapshot.key;
    try {
      const maybePromise = savePersistedSession?.(snapshot.session);
      if (isPromiseLike(maybePromise)) {
        maybePromise.catch((error) => reportError?.(error, { operation: "save" }));
      }
    } catch (error) {
      reportError?.(error, { operation: "save" });
    }
  }

  return {
    persistCommittedResult,
  };
}

function isPromiseLike(value) {
  return value && typeof value.catch === "function";
}
