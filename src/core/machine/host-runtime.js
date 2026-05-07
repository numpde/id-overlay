import { transitionMachineEffectResult } from "./effect-result-transition.js";
import { createMachineHostEffectServices } from "./host-effect-services.js";
import { createMachineHostPageContextService } from "./host-page-context-service.js";
import { createMachineHostPersistenceService } from "./host-persistence-service.js";
import { createMachineHostSubscriptionService } from "./host-subscription-service.js";
import {
  fromPersistedMachineSession,
} from "./persistence.js";
import { createMachineRuntime } from "./runtime.js";

export function createHostedMachineRuntime({
  persistedSession = null,
  savePersistedSession = null,
  readPasteImage = null,
  startManualPasteCapture = null,
  cancelManualPasteCapture = null,
  setPanelTimeout = null,
  clearPanelTimeout = null,
  panelTimeoutMs = undefined,
  setStatusTimeout = null,
  clearStatusTimeout = null,
  statusTimeoutMs = undefined,
  onError = null,
} = {}) {
  let destroyed = false;

  const runtime = createMachineRuntime({
    initialState: fromPersistedMachineSession(persistedSession),
  });
  const effectServices = createMachineHostEffectServices({
    readPasteImage,
    startManualPasteCapture,
    cancelManualPasteCapture,
    setPanelTimeout,
    clearPanelTimeout,
    panelTimeoutMs,
    setStatusTimeout,
    clearStatusTimeout,
    statusTimeoutMs,
    completeEffectResult,
    reportError,
  });
  const pageContextService = createMachineHostPageContextService({
    runtime,
    persistedSession,
    commitMachineResult,
  });
  const persistenceService = createMachineHostPersistenceService({
    runtime,
    savePersistedSession,
    reportError,
  });
  const subscriptionService = createMachineHostSubscriptionService({
    runtime,
    isDestroyed: () => destroyed,
  });

  function getState() {
    return runtime.getState();
  }

  function subscribe(listener, options) {
    return subscriptionService.subscribe(listener, options);
  }

  function commitTransition(transition, context = {}) {
    return commitLiveResult((state) => transition(state), context);
  }

  function completeEffectResult(result) {
    return commitLiveResult((state) => transitionMachineEffectResult(state, result), {
      effectResult: result,
    });
  }

  function ingestPageContext(pageContext) {
    if (destroyed) {
      return createNoopMachineResult(runtime.getState());
    }
    return pageContextService.ingestPageContext(pageContext);
  }

  function destroy() {
    if (destroyed) {
      return;
    }
    destroyed = true;
    persistenceService.destroy();
    subscriptionService.destroy();
    effectServices.destroy();
  }

  function commitLiveResult(createResult, context = {}) {
    if (destroyed) {
      return createNoopMachineResult(runtime.getState());
    }
    return commitMachineResult(createResult(runtime.getState()), context);
  }

  function commitMachineResult(result, context = {}) {
    const committedResult = runtime.commitMachineResult(result);
    runEffects(committedResult.effects, {
      ...context,
      state: committedResult.state,
      result: committedResult,
    });
    return committedResult;
  }

  function runEffects(effects, context) {
    if (!Array.isArray(effects)) {
      return;
    }
    for (const effect of effects) {
      effectServices.runEffect(effect, context);
    }
  }

  function reportError(error, context) {
    onError?.(error, context);
  }

  return {
    getState,
    subscribe,
    commitTransition,
    ingestPageContext,
    destroy,
  };
}

export function createNoopMachineResult(state) {
  return {
    state,
    effects: [],
    historyRecord: null,
    consumedHistoryRecord: null,
  };
}
