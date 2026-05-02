export function createValueStore(initialValue) {
  // Final semantic-history shape: this generic observable is fine for adapter
  // state, but avoid using it to create additional sources of canonical UI
  // truth outside the transition machine.
  let value = initialValue;
  const listeners = new Set();

  function get() {
    return value;
  }

  function set(nextValue) {
    if (Object.is(value, nextValue)) {
      return value;
    }
    value = nextValue;
    for (const listener of listeners) {
      listener(value);
    }
    return value;
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
