import { machineStatesEqual, normalizeMachineState } from "./state.js";

export function createMachineRuntime({
  initialState = undefined,
} = {}) {
  let state = normalizeMachineState(initialState);
  const listeners = new Set();

  function getState() {
    return state;
  }

  function subscribe(listener, { emitCurrent = true } = {}) {
    listeners.add(listener);
    if (emitCurrent) {
      listener(state);
    }
    return () => listeners.delete(listener);
  }

  function commitMachineResult(result) {
    const previousState = state;
    state = machineStatesEqual(previousState, result.state) ? previousState : result.state;
    const committedResult = state === result.state
      ? result
      : {
          ...result,
          state,
        };

    if (state !== previousState) {
      notify();
    }

    return committedResult;
  }

  function notify() {
    for (const listener of listeners) {
      listener(state);
    }
  }

  return {
    getState,
    subscribe,
    commitMachineResult,
  };
}
