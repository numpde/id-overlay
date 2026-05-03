import { createValueStore } from "../core/value-store.js";
import {
  formatFeedback,
  selectStatus,
} from "../core/machine/selectors.js";

const DEFAULT_TRANSIENT_MS = 1800;

export function createStatusController({
  machineHost,
  transientMs = DEFAULT_TRANSIENT_MS,
}) {
  const messageStore = createValueStore("");
  let transientMessage = null;
  let transientTimer = null;

  const unsubscribeMachine = machineHost.subscribe(syncMessage, { emitCurrent: false });
  const unsubscribeMachineResults = machineHost.subscribeResults?.(({ result }) => {
    showFeedback(result.feedback);
  }) ?? (() => {});

  syncMessage();

  function subscribe(listener, options) {
    return messageStore.subscribe(listener, options);
  }

  function getMessage() {
    return messageStore.get();
  }

  function refresh() {
    syncMessage();
  }

  function showFeedback(feedback, options) {
    const message = formatFeedback(feedback);
    if (message) {
      showTransient(message, options);
    }
  }

  function showTransient(message, { durationMs = transientMs } = {}) {
    transientMessage = message;
    syncMessage();
    clearTransientTimer();
    transientTimer = globalThis.setTimeout(() => {
      transientMessage = null;
      syncMessage();
    }, durationMs);
  }

  function destroy() {
    clearTransientTimer();
    unsubscribeMachine();
    unsubscribeMachineResults();
  }

  function syncMessage() {
    messageStore.set(transientMessage ?? selectStatus(machineHost.getState()));
  }

  function clearTransientTimer() {
    if (transientTimer) {
      globalThis.clearTimeout(transientTimer);
      transientTimer = null;
    }
  }

  return {
    subscribe,
    getMessage,
    refresh,
    destroy,
  };
}
