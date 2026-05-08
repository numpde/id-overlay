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

export function createInteractionRuntimeFactPort({
  machineActions,
  getPointerScreenPx = () => null,
}) {
  return {
    observePointer,
    clearPointer,
    observeGestureStart,
    observeGestureMove,
    observeGestureFinish,
    observeInputInterrupted,
    observePassThroughPress,
    observePassThroughRelease,
  };

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

  function observeInputInterrupted({ pointerScreenPx = getPointerScreenPx() } = {}) {
    machineActions.observeRuntimeFact(createInputInterruptedFact({ pointerScreenPx }));
  }

  function observePassThroughPress() {
    machineActions.observeRuntimeFact(createInputPassThroughPressedFact());
  }

  function observePassThroughRelease() {
    machineActions.observeRuntimeFact(createInputPassThroughReleasedFact());
  }
}
