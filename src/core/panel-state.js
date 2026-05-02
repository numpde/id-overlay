import { UI_PANEL_INTENT_KIND } from "./ui-state-model.js";

export const PANEL_ACTION_DEFAULTS = Object.freeze({
  clearConfirmationTimeoutMs: 1800,
});

export function createInitialPanelActionState() {
  return {
    kind: UI_PANEL_INTENT_KIND.IDLE,
    sessionId: 0,
  };
}

export function syncPanelActionState(state, nextKind) {
  if (state.kind === nextKind) {
    return state;
  }

  switch (nextKind) {
    case UI_PANEL_INTENT_KIND.PASTE_ARMED:
      return createPanelActionState(
        UI_PANEL_INTENT_KIND.PASTE_ARMED,
        state.sessionId + 1,
      );
    case UI_PANEL_INTENT_KIND.CLEAR_PINS_CONFIRM:
      return createPanelActionState(
        UI_PANEL_INTENT_KIND.CLEAR_PINS_CONFIRM,
        state.sessionId,
      );
    case UI_PANEL_INTENT_KIND.CLEAR_IMAGE_CONFIRM:
      return createPanelActionState(
        UI_PANEL_INTENT_KIND.CLEAR_IMAGE_CONFIRM,
        state.sessionId,
      );
    case UI_PANEL_INTENT_KIND.IDLE:
      return createPanelActionState(
        UI_PANEL_INTENT_KIND.IDLE,
        isPasteArmedPanelIntent(state.kind) ? state.sessionId + 1 : state.sessionId,
      );
    default:
      return state;
  }
}

export function isPanelActionSessionActive(state, sessionId) {
  return isPasteArmedPanelIntent(state.kind) && state.sessionId === sessionId;
}

export function isPasteArmedPanelIntent(intent) {
  return intent === UI_PANEL_INTENT_KIND.PASTE_ARMED;
}

export function isClearConfirmationPanelIntent(intent) {
  return (
    intent === UI_PANEL_INTENT_KIND.CLEAR_PINS_CONFIRM ||
    intent === UI_PANEL_INTENT_KIND.CLEAR_IMAGE_CONFIRM
  );
}

function createPanelActionState(kind, sessionId) {
  return {
    kind,
    sessionId,
  };
}
