import { createValueStore } from "../core/value-store.js";
import {
  describeInteractionEventPresentation,
  resolveDefaultStatusMessage,
} from "../core/presentation.js";
import { resolveUiStatusBaseline } from "../core/ui-status-model.js";

const DEFAULT_TRANSIENT_MS = 1800;

export function createStatusController({ store, interactions }) {
  const messageStore = createValueStore("");
  let transientMessage = null;
  let transientTimer = null;
  let uiStateSource = null;

  const unsubscribeStore = store.subscribe(syncMessage, { emitCurrent: false });
  const unsubscribeInteractions = interactions.subscribe(syncMessage, { emitCurrent: false });
  const unsubscribeInteractionEvents = interactions.subscribeEvents?.((event) => {
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

  function setUiStateSource(source) {
    uiStateSource = source;
    syncMessage();
  }

  function refresh() {
    syncMessage();
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

  function destroy() {
    clearTransientTimer();
    uiStateSource = null;
    unsubscribeStore();
    unsubscribeInteractions();
    unsubscribeInteractionEvents?.();
  }

  function syncMessage() {
    messageStore.set(
      transientMessage ??
        resolveBaselineMessage(),
    );
  }

  function resolveBaselineMessage() {
    if (uiStateSource) {
      return resolveUiStatusBaseline({
        uiState: uiStateSource(),
        runtime: interactions.getRuntimeState(),
      });
    }
    return resolveDefaultStatusMessage({
      state: store.getState(),
      runtime: interactions.getRuntimeState(),
    });
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
    showTransient,
    setUiStateSource,
    refresh,
    destroy,
  };
}
