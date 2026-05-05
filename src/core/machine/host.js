import {
  MACHINE_EVENT_KIND,
  createCancelPanelIntentEvent,
} from "./events.js";
import { createMachineEffectRunner } from "./effect-runner.js";
import {
  toPersistedMachineSessionSnapshot,
  fromPersistedMachineSession,
} from "./persistence.js";
import { createMachineRuntime } from "./runtime.js";

const DEFAULT_PANEL_TIMEOUT_MS = 1800;
const DEFAULT_STATUS_TIMEOUT_MS = 1800;

export function createMachineHost({
  persistedSession = null,
  savePersistedSession = null,
  readPasteImage = null,
  startManualPasteCapture = null,
  cancelManualPasteCapture = null,
  setPanelTimeout = null,
  clearPanelTimeout = null,
  panelTimeoutMs = DEFAULT_PANEL_TIMEOUT_MS,
  setStatusTimeout = null,
  clearStatusTimeout = null,
  statusTimeoutMs = DEFAULT_STATUS_TIMEOUT_MS,
  onError = null,
} = {}) {
  // TODO(smell): Host owns runtime lifecycle, persistence, effect adapter
  // wiring, panel/status timers, and external subscribers. Split effect host
  // services from durable persistence so machine hosting is not the catch-all
  // boundary for every side effect.
  let destroyed = false;
  const panelTimers = new Map();
  const statusTimers = new Map();
  const subscriberUnsubscribes = new Set();
  let runtime = null;
  let unsubscribePersistence = null;
  let lastPersistedKey = "";

  const runEffect = createMachineEffectRunner({
    readPasteImage,
    startManualPasteCapture,
    cancelManualPasteCapture,
    startPanelTimeout,
    cancelPanelTimeout,
    startStatusTimeout,
    cancelStatusTimeout,
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
    const result = runtime.dispatch(event);
    return result;
  }

  function destroy() {
    if (destroyed) {
      return;
    }
    destroyed = true;
    unsubscribePersistence?.();
    clearSubscribers();
    cancelAllManualPasteCaptures();
    clearAllPanelTimers();
    clearAllStatusTimers();
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

  function startStatusTimeout({ requestId, context }) {
    cancelStatusTimeout({ requestId });
    if (!setStatusTimeout) {
      return;
    }
    const handle = setStatusTimeout(() => {
      statusTimers.delete(requestId);
      dispatch({
        type: MACHINE_EVENT_KIND.CLEAR_STATUS_NOTICE,
        requestId,
      });
    }, {
      requestId,
      delayMs: statusTimeoutMs,
      context,
    });
    statusTimers.set(requestId, handle);
  }

  function cancelStatusTimeout({ requestId }) {
    if (!statusTimers.has(requestId)) {
      return;
    }
    const handle = statusTimers.get(requestId);
    statusTimers.delete(requestId);
    clearStatusTimeout?.(handle);
  }

  function clearAllPanelTimers() {
    for (const handle of panelTimers.values()) {
      clearPanelTimeout?.(handle);
    }
    panelTimers.clear();
  }

  function clearAllStatusTimers() {
    for (const handle of statusTimers.values()) {
      clearStatusTimeout?.(handle);
    }
    statusTimers.clear();
  }

  function clearSubscribers() {
    for (const unsubscribe of subscriberUnsubscribes) {
      unsubscribe();
    }
    subscriberUnsubscribes.clear();
  }

  function cancelAllManualPasteCaptures() {
    cancelManualPasteCapture?.({ requestId: null });
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
    historyRecord: null,
    consumedHistoryRecord: null,
  };
}

function isPromiseLike(value) {
  return value && typeof value.catch === "function";
}
