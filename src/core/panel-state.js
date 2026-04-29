export const PANEL_ACTION_KIND = Object.freeze({
  IDLE: "idle",
  PASTE_ARMED: "paste-armed",
  CLEAR_CONFIRM: "clear-confirm",
});

export const PANEL_ACTION_EVENT = Object.freeze({
  ARM_PASTE: "arm-paste",
  CANCEL_PASTE: "cancel-paste",
  ARM_CLEAR_CONFIRM: "arm-clear-confirm",
  RESET: "reset",
});

export const PANEL_ACTION_DEFAULTS = Object.freeze({
  clearConfirmationTimeoutMs: 1800,
});

export function createInitialPanelActionState() {
  return {
    kind: PANEL_ACTION_KIND.IDLE,
    sessionId: 0,
  };
}

export function reducePanelActionState(state, eventType) {
  switch (eventType) {
    case PANEL_ACTION_EVENT.ARM_PASTE:
      return {
        kind: PANEL_ACTION_KIND.PASTE_ARMED,
        sessionId: state.sessionId + 1,
      };
    case PANEL_ACTION_EVENT.CANCEL_PASTE:
      return {
        kind: PANEL_ACTION_KIND.IDLE,
        sessionId: state.sessionId + 1,
      };
    case PANEL_ACTION_EVENT.ARM_CLEAR_CONFIRM:
      return {
        kind: PANEL_ACTION_KIND.CLEAR_CONFIRM,
        sessionId: state.sessionId,
      };
    case PANEL_ACTION_EVENT.RESET:
      return {
        kind: PANEL_ACTION_KIND.IDLE,
        sessionId: state.sessionId,
      };
    default:
      return state;
  }
}

export function isPasteArmed(state) {
  return state.kind === PANEL_ACTION_KIND.PASTE_ARMED;
}

export function isClearConfirming(state) {
  return state.kind === PANEL_ACTION_KIND.CLEAR_CONFIRM;
}

export function isPanelActionIdle(state) {
  return state.kind === PANEL_ACTION_KIND.IDLE;
}

export function hasActivePanelAction(state) {
  return !isPanelActionIdle(state);
}

export function isPanelActionSessionActive(state, sessionId) {
  return isPasteArmed(state) && state.sessionId === sessionId;
}

export function resolvePanelActionSemantics(
  state,
  {
    hasImage = true,
    clearConfirmationTimeoutMs = PANEL_ACTION_DEFAULTS.clearConfirmationTimeoutMs,
  } = PANEL_ACTION_DEFAULTS,
) {
  const pasteArmed = isPasteArmed(state);
  const clearConfirming = isClearConfirming(state);
  const hasActiveAction = hasActivePanelAction(state);
  return {
    isIdle: isPanelActionIdle(state),
    hasActiveAction,
    pasteArmed,
    clearConfirming,
    shouldReset: !hasImage && hasActiveAction,
    shouldAttachPasteListener: pasteArmed,
    autoResetTimeoutMs: clearConfirming ? clearConfirmationTimeoutMs : null,
  };
}
