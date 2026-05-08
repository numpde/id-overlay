import { createInteractionRuntimeObservation } from "./runtime-observation.js";

export function createInteractionRuntimeBridge({
  machineHost,
  runtimeActions,
}) {
  const runtimeObservation = createInteractionRuntimeObservation({
    machineHost,
  });

  return {
    destroy: runtimeObservation.destroy,
    getRuntimeState: runtimeObservation.getRuntimeState,
    getPointerScreenPx: runtimeObservation.getPointerScreenPx,
    subscribe: runtimeObservation.subscribe,
    observePointer: runtimeActions.observePointer,
    clearPointer: runtimeActions.clearPointer,
    observeGestureStart: runtimeActions.observeGestureStart,
    observeGestureMove: runtimeActions.observeGestureMove,
    observeGestureFinish: runtimeActions.observeGestureFinish,
    observeInputInterrupted,
    observePassThroughPress: runtimeActions.observePassThroughPress,
    observePassThroughRelease: runtimeActions.observePassThroughRelease,
  };

  function observeInputInterrupted({
    pointerScreenPx = runtimeObservation.getPointerScreenPx(),
  } = {}) {
    return runtimeActions.observeInputInterrupted({ pointerScreenPx });
  }
}
