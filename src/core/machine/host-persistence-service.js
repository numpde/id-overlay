import {
  toPersistedMachineSessionSnapshot,
} from "./persistence.js";

export function createMachineHostPersistenceService({
  runtime,
  savePersistedSession = null,
  reportError = null,
} = {}) {
  if (!runtime) {
    return {
      destroy() {},
    };
  }

  let lastPersistedKey = toPersistedMachineSessionSnapshot(runtime.getState()).key;
  const unsubscribe = runtime.subscribe(persistState, {
    emitCurrent: false,
  });

  function persistState(state) {
    const snapshot = toPersistedMachineSessionSnapshot(state);
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

  function destroy() {
    unsubscribe();
  }

  return {
    destroy,
  };
}

function isPromiseLike(value) {
  return value && typeof value.catch === "function";
}
