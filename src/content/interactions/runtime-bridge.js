import {
  selectIsInputPassThroughActive,
  selectIsRuntimeDragging,
  selectRuntimeGestureKind,
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
  adapterDrag,
}) {
  // TODO(smell): Runtime observation and adapter drag cleanup are still coupled
  // here. The ideal boundary would expose a single gesture-lifecycle port so
  // runtime reset effects and adapter cancellation cannot drift apart.
  let destroyed = false;
  let observedRuntime = machineHost.getState().runtime;
  const runtimeUnsubscribes = new Set();

  trackRuntimeSubscription(machineHost.subscribe((state) => {
    const previousRuntime = observedRuntime;
    observedRuntime = state.runtime;
    syncAdapterDragFromRuntimeChange(previousRuntime, state.runtime);
  }, { emitCurrent: false }));

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
    observePassThroughPress,
    observePassThroughRelease,
    reset,
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
      if (!areInputRuntimesEqual(previousRuntime, nextRuntime)) {
        previousRuntime = nextRuntime;
        listener(nextRuntime);
      }
    }, { emitCurrent: false }));
  }

  function observePointer(screenPx) {
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

  function observePassThroughPress() {
    machineActions.observeRuntimeFact(createInputPassThroughPressedFact());
  }

  function observePassThroughRelease() {
    machineActions.observeRuntimeFact(createInputPassThroughReleasedFact());
  }

  function reset({
    endPointerScreenPx = getPointerScreenPx(),
    pointerScreenPx = getPointerScreenPx(),
    commitPlacement = true,
  } = {}) {
    adapterDrag.cancel(endPointerScreenPx, { commitPlacement });
    machineActions.observeRuntimeFact(createInputInterruptedFact({ pointerScreenPx }));
  }

  function syncAdapterDragFromRuntimeChange(previousRuntime, nextRuntime) {
    if (
      !adapterDrag.hasActive() ||
      !selectIsRuntimeDragging(previousRuntime) ||
      selectIsRuntimeDragging(nextRuntime)
    ) {
      return;
    }
    adapterDrag.cancel(selectRuntimePointerScreenPx(previousRuntime), {
      commitPlacement: false,
    });
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

function areInputRuntimesEqual(left, right) {
  const leftProjection = selectInputRuntimeProjection(left);
  const rightProjection = selectInputRuntimeProjection(right);
  return (
    leftProjection.pointerScreenPx?.x === rightProjection.pointerScreenPx?.x &&
    leftProjection.pointerScreenPx?.y === rightProjection.pointerScreenPx?.y &&
    leftProjection.gestureKind === rightProjection.gestureKind &&
    leftProjection.passThroughOverride === rightProjection.passThroughOverride
  );
}

function selectInputRuntimeProjection(runtime) {
  return {
    pointerScreenPx: selectRuntimePointerScreenPx(runtime),
    gestureKind: selectRuntimeGestureKind(runtime),
    passThroughOverride: selectIsInputPassThroughActive(runtime),
  };
}
