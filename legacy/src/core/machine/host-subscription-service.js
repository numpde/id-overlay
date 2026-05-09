export function createMachineHostSubscriptionService({
  runtime,
  isDestroyed = () => false,
} = {}) {
  const unsubscribes = new Set();

  function subscribe(listener, options) {
    if (!runtime || isDestroyed()) {
      return () => {};
    }
    const unsubscribeRuntime = runtime.subscribe(listener, options);
    function unsubscribe() {
      unsubscribes.delete(unsubscribe);
      unsubscribeRuntime();
    }
    unsubscribes.add(unsubscribe);
    return unsubscribe;
  }

  function destroy() {
    for (const unsubscribe of unsubscribes) {
      unsubscribe();
    }
    unsubscribes.clear();
  }

  return {
    subscribe,
    destroy,
  };
}
