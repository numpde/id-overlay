import { createValueStore } from "../core/value-store.js";
import {
  describePanelActionPresentation,
  describeInteractionEventPresentation,
} from "../core/presentation.js";
import { resolveUiStatusBaseline } from "../core/ui-status-model.js";
import { projectLiveUiState } from "../core/ui-live-state.js";
import { UI_PANEL_INTENT_KIND } from "../core/ui-state-model.js";

const DEFAULT_TRANSIENT_MS = 1800;

export function createStatusController({ store, interactions }) {
  const messageStore = createValueStore("");
  // Final semantic-history shape: transient timing may remain an external
  // display concern, but the transient message identity should come from the
  // consumed semantic transition/event presentation, not from imperative
  // effect handlers composing fallback text.
  let transientMessage = null;
  let transientTimer = null;
  let panelActionStateSource = null;

  const unsubscribeStore = store.subscribe(syncMessage, { emitCurrent: false });
  const unsubscribeInteractions = interactions.subscribe(syncMessage, { emitCurrent: false });
  const unsubscribeInteractionEvents = interactions.subscribeEvents?.((event) => {
    // Final semantic-history shape: this is a second feedback channel beside
    // transition-result feedback. Either lift interaction events into
    // canonical UI outcomes or keep them strictly adapter-local.
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

  function setPanelActionStateSource(source) {
    panelActionStateSource = source;
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
    panelActionStateSource = null;
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
    // Final semantic-history shape: baseline status should remain a pure
    // projection of canonical UI state. Avoid reintroducing panel-local prompt
    // composition here when undo/redo records move into the state machine.
    return resolveUiStatusBaseline({
      uiState: projectLiveUiState({
        state: store.getState(),
        runtime: interactions.getRuntimeState(),
        panelActionState: panelActionStateSource?.() ?? {
          kind: UI_PANEL_INTENT_KIND.IDLE,
        },
      }),
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
    showPanelFeedback,
    clearTransient,
    setPanelActionStateSource,
    refresh,
    destroy,
  };
}
