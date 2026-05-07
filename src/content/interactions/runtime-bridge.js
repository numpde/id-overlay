import {
  selectInputRuntimeObservationKey,
  selectRuntimePointerScreenPx,
} from "../../core/machine/selectors.js";
import {
  createGestureBeganFact,
  createGestureEndedFact,
  createGestureMovedFact,
  createInputInterruptedFact,
  createInputPassThroughPressedFact,
  createInputPassThroughReleasedFact,
  createPointerClearedFact,
  createPointerObservedFact,
} from "../../core/machine/runtime-facts.js";

export function createInteractionRuntimeBridge({
  machineHost,
  machineActions,
}) {
  // TODO(smell): This bridge translates content observations into machine
  // runtime facts and also provides runtime subscriptions back to content. The
  // final interaction boundary should separate write-only fact ingress from
  // read-only runtime observation.
  let destroyed = false;
  const runtimeUnsubscribes = new Set();

  return {
    destroy,
    getRuntimeState,
    getPointerScreenPx,
    subscribe,
    observePointer,
    clearPointer,
    observeGestureStart,
    observeGestureMove,
    observeGestureFinish,
    observeInputInterrupted,
    observePassThroughPress,
    observePassThroughRelease,
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
    // TODO(smell): Runtime subscription filtering duplicates the machine's
    // observation-key selector knowledge in content. Keep the selector here as
    // the only leak until overlay runtime observation becomes a machine port.
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

  function observePointer(screenPx) {
    // TODO(smell): These observe* methods are thin fact constructors. If more
    // runtime facts appear, expose a single typed runtime-fact ingress instead
    // of adding one method per fact here.
    machineActions.observeRuntimeFact(createPointerObservedFact(screenPx));
  }

  function clearPointer() {
    machineActions.observeRuntimeFact(createPointerClearedFact());
  }

  function observeGestureStart(screenPx, { gestureKind }) {
    machineActions.observeRuntimeFact(createGestureBeganFact({ screenPx, gestureKind }));
  }

  function observeGestureMove(screenPx, { gestureKind }) {
    machineActions.observeRuntimeFact(createGestureMovedFact({ screenPx, gestureKind }));
  }

  function observeGestureFinish(screenPx) {
    machineActions.observeRuntimeFact(createGestureEndedFact({ screenPx }));
  }

  function observeInputInterrupted({ pointerScreenPx = getPointerScreenPx() } = {}) {
    machineActions.observeRuntimeFact(createInputInterruptedFact({ pointerScreenPx }));
  }

  function observePassThroughPress() {
    machineActions.observeRuntimeFact(createInputPassThroughPressedFact());
  }

  function observePassThroughRelease() {
    machineActions.observeRuntimeFact(createInputPassThroughReleasedFact());
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
