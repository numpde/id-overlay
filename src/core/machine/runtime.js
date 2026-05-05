import { machineStatesEqual, normalizeMachineState } from "./state.js";
import { transitionMachine } from "./transition.js";

export function createMachineRuntime({
  initialState = undefined,
  executeEffect = null,
  onEffectError = null,
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

  function dispatch(event, { transition = transitionMachine } = {}) {
    // TODO(smell): Runtime accepts arbitrary machine events and executes effects
    // from the same path. After the ingress split, this should accept public
    // user/fact events only; private replay/mutation operations should stay
    // inside transition orchestration.
    const result = transition(state, event);
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

    runEffects(committedResult.effects, {
      event,
      state,
      result: committedResult,
    });

    return committedResult;
  }

  function notify() {
    for (const listener of listeners) {
      listener(state);
    }
  }

  function runEffects(effects, context) {
    if (!executeEffect || !Array.isArray(effects)) {
      return;
    }
    for (const effect of effects) {
      try {
        const maybePromise = executeEffect(effect, context);
        if (isPromiseLike(maybePromise)) {
          maybePromise.catch((error) => reportEffectError(error, {
            ...context,
            effect,
          }));
        }
      } catch (error) {
        reportEffectError(error, {
          ...context,
          effect,
        });
      }
    }
  }

  function reportEffectError(error, context) {
    if (onEffectError) {
      onEffectError(error, context);
    }
  }

  return {
    getState,
    subscribe,
    applyMachineEvent: dispatch,
    dispatch,
  };
}

function isPromiseLike(value) {
  return value && typeof value.catch === "function";
}
