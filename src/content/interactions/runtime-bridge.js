import { MACHINE_EVENT_KIND, MACHINE_INPUT_OVERRIDE } from "../../core/machine/events.js";
import {
  selectIsInputPassThroughActive,
  selectIsRuntimeDragging,
  selectRuntimeGestureKind,
  selectRuntimePointerScreenPx,
} from "../../core/machine/selectors.js";

export function createInteractionRuntimeBridge({
  machineHost,
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
    updatePointer,
    beginGesture,
    endGesture,
    setPassThrough,
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

  function updatePointer(screenPx) {
    dispatchMachine({
      type: MACHINE_EVENT_KIND.UPDATE_POINTER_RUNTIME,
      screenPx,
    });
  }

  function beginGesture(screenPx, { gestureKind }) {
    dispatchMachine({
      type: MACHINE_EVENT_KIND.BEGIN_POINTER_GESTURE,
      screenPx,
      gestureKind,
    });
  }

  function endGesture(screenPx) {
    dispatchMachine({
      type: MACHINE_EVENT_KIND.END_POINTER_GESTURE,
      screenPx,
    });
  }

  function setPassThrough(isActive) {
    dispatchMachine({
      type: MACHINE_EVENT_KIND.SET_INPUT_OVERRIDE,
      inputOverride: isActive ? MACHINE_INPUT_OVERRIDE.PASS_THROUGH : null,
    });
  }

  function reset({
    endPointerScreenPx = getPointerScreenPx(),
    pointerScreenPx = getPointerScreenPx(),
    commitPlacement = true,
  } = {}) {
    adapterDrag.cancel(endPointerScreenPx, { commitPlacement });
    dispatchMachine({
      type: MACHINE_EVENT_KIND.RESET_INPUT_RUNTIME,
      screenPx: pointerScreenPx,
    });
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

  function dispatchMachine(event) {
    return machineHost.dispatch(event);
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
