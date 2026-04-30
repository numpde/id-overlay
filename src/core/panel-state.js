import { UI_PANEL_INTENT_KIND } from "./ui-state-model.js";

export const PANEL_ACTION_KIND = UI_PANEL_INTENT_KIND;

export const PANEL_ACTION_DEFAULTS = Object.freeze({
  clearConfirmationTimeoutMs: 1800,
});

export function createInitialPanelActionState() {
  return {
    kind: PANEL_ACTION_KIND.IDLE,
    sessionId: 0,
  };
}

export function syncPanelActionState(state, nextKind) {
  if (state.kind === nextKind) {
    return state;
  }

  switch (nextKind) {
    case PANEL_ACTION_KIND.PASTE_ARMED:
      return createPanelActionState(
        PANEL_ACTION_KIND.PASTE_ARMED,
        state.sessionId + 1,
      );
    case PANEL_ACTION_KIND.CLEAR_PINS_CONFIRM:
      return createPanelActionState(
        PANEL_ACTION_KIND.CLEAR_PINS_CONFIRM,
        state.sessionId,
      );
    case PANEL_ACTION_KIND.CLEAR_IMAGE_CONFIRM:
      return createPanelActionState(
        PANEL_ACTION_KIND.CLEAR_IMAGE_CONFIRM,
        state.sessionId,
      );
    case PANEL_ACTION_KIND.IDLE:
      return createPanelActionState(
        PANEL_ACTION_KIND.IDLE,
        isPasteArmed(state) ? state.sessionId + 1 : state.sessionId,
      );
    default:
      return state;
  }
}

function isPasteArmed(state) {
  return state.kind === PANEL_ACTION_KIND.PASTE_ARMED;
}

export function isPanelActionSessionActive(state, sessionId) {
  return isPasteArmed(state) && state.sessionId === sessionId;
}

function createPanelActionState(kind, sessionId) {
  return {
    kind,
    sessionId,
  };
}
