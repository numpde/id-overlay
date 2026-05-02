import { createValueStore } from "../core/value-store.js";
import {
  describeInteractionEventPresentation,
  describePanelActionPresentation,
} from "../core/presentation.js";
import {
  formatFeedback,
  selectStatus,
} from "../core/machine/selectors.js";

const DEFAULT_TRANSIENT_MS = 1800;

export function createStatusController({ machineHost, interactions = null }) {
  const messageStore = createValueStore("");
  let transientMessage = null;
  let transientTimer = null;

  const unsubscribeMachine = machineHost.subscribe(syncMessage, { emitCurrent: false });
  const unsubscribeInteractionEvents = interactions?.subscribeEvents?.((event) => {
    const eventMessage = describeInteractionEventPresentation(event);
    if (eventMessage) {
      showTransient(eventMessage);
    }
  }) ?? null;

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

  function showMachineFeedback(feedback, options) {
    const message = formatFeedback(feedback);
    if (message) {
      showTransient(message, options);
    }
  }

  function showTransient(message, { durationMs = DEFAULT_TRANSIENT_MS } = {}) {
    transientMessage = message;
    syncMessage();
    clearTransientTimer();
    transientTimer = globalThis.setTimeout(() => {
      transientMessage = null;
      syncMessage();
    }, durationMs);
  }

  function showPanelFeedback(action, payload, options) {
    const message = describePanelActionPresentation(action, payload);
    if (message) {
      showTransient(message, options);
    }
  }

  function clearTransient() {
    if (transientMessage === null && !transientTimer) {
      return;
    }
    transientMessage = null;
    clearTransientTimer();
    syncMessage();
  }

  function destroy() {
    clearTransientTimer();
    unsubscribeMachine();
    unsubscribeInteractionEvents?.();
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
    showMachineFeedback,
    showTransient,
    showPanelFeedback,
    clearTransient,
    refresh,
    destroy,
  };
}
