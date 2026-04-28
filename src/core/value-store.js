export function createValueStore(initialValue) {
  let value = initialValue;
  const listeners = new Set();

  function get() {
    return value;
  }

  function set(nextValue) {
    value = nextValue;
    for (const listener of listeners) {
      listener(value);
    }
  }

  function subscribe(listener, { emitCurrent = true } = {}) {
    listeners.add(listener);
    if (emitCurrent) {
      listener(value);
    }
    return () => listeners.delete(listener);
  }

  return {
    get,
    set,
    subscribe,
  };
}

