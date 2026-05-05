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
  let observedRuntime = machineHost.getState().runtime;
  const unsubscribeMachine = machineHost.subscribe((state) => {
    const previousRuntime = observedRuntime;
    observedRuntime = state.runtime;
    syncAdapterDragFromRuntimeChange(previousRuntime, state.runtime);
  }, { emitCurrent: false });

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
    unsubscribeMachine();
  }

  function getRuntimeState() {
    return machineHost.getState().runtime;
  }

  function getPointerScreenPx() {
    return selectRuntimePointerScreenPx(getRuntimeState());
  }

  function subscribe(listener, options) {
    const { emitCurrent = true } = options ?? {};
    let previousRuntime = getRuntimeState();
    if (emitCurrent) {
      listener(previousRuntime);
    }
    return machineHost.subscribe((state) => {
      const nextRuntime = state.runtime;
      if (!areInputRuntimesEqual(previousRuntime, nextRuntime)) {
        previousRuntime = nextRuntime;
        listener(nextRuntime);
      }
    }, { emitCurrent: false });
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
}

function areInputRuntimesEqual(left, right) {
  return (
    selectRuntimePointerScreenPx(left)?.x === selectRuntimePointerScreenPx(right)?.x &&
    selectRuntimePointerScreenPx(left)?.y === selectRuntimePointerScreenPx(right)?.y &&
    selectRuntimeGestureKind(left) === selectRuntimeGestureKind(right) &&
    selectIsInputPassThroughActive(left) === selectIsInputPassThroughActive(right)
  );
}
