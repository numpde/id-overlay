import {
  selectInputRuntimeObservationKey,
  selectRuntimePointerScreenPx,
} from "../../core/machine/selectors.js";

export function createInteractionRuntimeObservation({
  machineHost,
}) {
  let destroyed = false;
  const runtimeUnsubscribes = new Set();

  return {
    destroy,
    getRuntimeState,
    getPointerScreenPx,
    subscribe,
  };

  function destroy() {
    if (destroyed) {
      return;
    }
    destroyed = true;
    for (const unsubscribe of Array.from(runtimeUnsubscribes)) {
      unsubscribe();
    }
    runtimeUnsubscribes.clear();
  }

  function getRuntimeState() {
    return machineHost.getState().runtime;
  }

  function getPointerScreenPx() {
    return selectRuntimePointerScreenPx(getRuntimeState());
  }

  function subscribe(listener, options) {
    if (destroyed) {
      return () => {};
    }
    const { emitCurrent = true } = options ?? {};
    let previousRuntime = getRuntimeState();
    if (emitCurrent) {
      listener(previousRuntime);
    }
    return trackRuntimeSubscription(machineHost.subscribe((state) => {
      const nextRuntime = state.runtime;
      if (
        selectInputRuntimeObservationKey(previousRuntime) !==
        selectInputRuntimeObservationKey(nextRuntime)
      ) {
        const oldRuntime = previousRuntime;
        previousRuntime = nextRuntime;
        listener(nextRuntime, oldRuntime);
      }
    }, { emitCurrent: false }));
  }

  function trackRuntimeSubscription(unsubscribeRuntime) {
    if (destroyed) {
      unsubscribeRuntime();
      return () => {};
    }

    let active = true;
    function unsubscribe() {
      if (!active) {
        return;
      }
      active = false;
      runtimeUnsubscribes.delete(unsubscribe);
      unsubscribeRuntime();
    }
    runtimeUnsubscribes.add(unsubscribe);
    return unsubscribe;
  }
}
