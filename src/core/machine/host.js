import {
  MACHINE_FEEDBACK_KIND,
  createCancelPanelIntentEvent,
} from "./events.js";
import { createMachineEffectRunner } from "./effect-runner.js";
import {
  toPersistedMachineSessionSnapshot,
  fromPersistedMachineSession,
} from "./persistence.js";
import { createMachineRuntime } from "./runtime.js";

const DEFAULT_PANEL_TIMEOUT_MS = 1800;
const NO_OP_RESULT_FEEDBACK = Object.freeze({
  kind: MACHINE_FEEDBACK_KIND.NONE,
  message: "",
});

export function createMachineHost({
  persistedSession = null,
  savePersistedSession = null,
  readPasteImage = null,
  setPanelTimeout = null,
  clearPanelTimeout = null,
  panelTimeoutMs = DEFAULT_PANEL_TIMEOUT_MS,
  onError = null,
} = {}) {
  let destroyed = false;
  const panelTimers = new Map();
  const subscriberUnsubscribes = new Set();
  let runtime = null;
  let unsubscribePersistence = null;
  let lastPersistedKey = "";

  const runEffect = createMachineEffectRunner({
    readPasteImage,
    startPanelTimeout,
    cancelPanelTimeout,
    dispatch: (event) => dispatch(event),
    getState: () => runtime?.getState(),
    onError: reportError,
  });

  runtime = createMachineRuntime({
    initialState: fromPersistedMachineSession(persistedSession),
    executeEffect: runEffect,
    onEffectError: reportError,
  });
  lastPersistedKey = toPersistedMachineSessionSnapshot(runtime.getState()).key;
  unsubscribePersistence = runtime.subscribe(persistState, {
    emitCurrent: false,
  });

  function getState() {
    return runtime.getState();
  }

  function subscribe(listener, options) {
    if (destroyed) {
      return () => {};
    }
    const unsubscribeRuntime = runtime.subscribe(listener, options);
    function unsubscribe() {
      subscriberUnsubscribes.delete(unsubscribe);
      unsubscribeRuntime();
    }
    subscriberUnsubscribes.add(unsubscribe);
    return unsubscribe;
  }

  function dispatch(event) {
    if (destroyed) {
      return createDestroyedDispatchResult(runtime.getState());
    }
    return runtime.dispatch(event);
  }

  function destroy() {
    if (destroyed) {
      return;
    }
    destroyed = true;
    unsubscribePersistence?.();
    clearSubscribers();
    clearAllPanelTimers();
  }

  function persistState(state) {
    const snapshot = toPersistedMachineSessionSnapshot(state);
    if (snapshot.key === lastPersistedKey) {
      return;
    }
    lastPersistedKey = snapshot.key;
    try {
      const maybePromise = savePersistedSession?.(snapshot.session);
      if (isPromiseLike(maybePromise)) {
        maybePromise.catch((error) => reportError(error, { operation: "save" }));
      }
    } catch (error) {
      reportError(error, { operation: "save" });
    }
  }

  function startPanelTimeout({ intent, requestId, context }) {
    cancelPanelTimeout({ requestId });
    if (!setPanelTimeout) {
      return;
    }
    const handle = setPanelTimeout(() => {
      panelTimers.delete(requestId);
      dispatch(createCancelPanelIntentEvent({ requestId }));
    }, {
      intent,
      requestId,
      delayMs: panelTimeoutMs,
      context,
    });
    panelTimers.set(requestId, handle);
  }

  function cancelPanelTimeout({ requestId }) {
    if (!panelTimers.has(requestId)) {
      return;
    }
    const handle = panelTimers.get(requestId);
    panelTimers.delete(requestId);
    clearPanelTimeout?.(handle);
  }

  function clearAllPanelTimers() {
    for (const handle of panelTimers.values()) {
      clearPanelTimeout?.(handle);
    }
    panelTimers.clear();
  }

  function clearSubscribers() {
    for (const unsubscribe of subscriberUnsubscribes) {
      unsubscribe();
    }
    subscriberUnsubscribes.clear();
  }

  function reportError(error, context) {
    onError?.(error, context);
  }

  return {
    getState,
    subscribe,
    dispatch,
    destroy,
  };
}

function createDestroyedDispatchResult(state) {
  return {
    state,
    effects: [],
    feedback: NO_OP_RESULT_FEEDBACK,
    historyRecord: null,
    consumedHistoryRecord: null,
  };
}

function isPromiseLike(value) {
  return value && typeof value.catch === "function";
}
