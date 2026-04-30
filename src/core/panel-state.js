export const PANEL_ACTION_KIND = Object.freeze({
  IDLE: "idle",
  PASTE_ARMED: "paste-armed",
  CLEAR_PINS_CONFIRM: "clear-pins-confirm",
  CLEAR_IMAGE_CONFIRM: "clear-image-confirm",
});

export const PANEL_ACTION_EVENT = Object.freeze({
  ARM_PASTE: "arm-paste",
  CANCEL_PASTE: "cancel-paste",
  ARM_CLEAR_PINS_CONFIRM: "arm-clear-pins-confirm",
  ARM_CLEAR_IMAGE_CONFIRM: "arm-clear-image-confirm",
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
      return createPanelActionState(
        PANEL_ACTION_KIND.PASTE_ARMED,
        state.sessionId + 1,
      );
    case PANEL_ACTION_EVENT.CANCEL_PASTE:
      if (!isPasteArmed(state)) {
        return state;
      }
      return createPanelActionState(
        PANEL_ACTION_KIND.IDLE,
        state.sessionId + 1,
      );
    case PANEL_ACTION_EVENT.ARM_CLEAR_PINS_CONFIRM:
      if (isClearPinsConfirming(state)) {
        return state;
      }
      return createPanelActionState(
        PANEL_ACTION_KIND.CLEAR_PINS_CONFIRM,
        state.sessionId,
      );
    case PANEL_ACTION_EVENT.ARM_CLEAR_IMAGE_CONFIRM:
      if (isClearImageConfirming(state)) {
        return state;
      }
      return createPanelActionState(
        PANEL_ACTION_KIND.CLEAR_IMAGE_CONFIRM,
        state.sessionId,
      );
    case PANEL_ACTION_EVENT.RESET:
      if (isPanelActionIdle(state)) {
        return state;
      }
      return createPanelActionState(
        PANEL_ACTION_KIND.IDLE,
        state.sessionId,
      );
    default:
      return state;
  }
}

export function isPasteArmed(state) {
  return state.kind === PANEL_ACTION_KIND.PASTE_ARMED;
}

export function isClearPinsConfirming(state) {
  return state.kind === PANEL_ACTION_KIND.CLEAR_PINS_CONFIRM;
}

export function isClearImageConfirming(state) {
  return state.kind === PANEL_ACTION_KIND.CLEAR_IMAGE_CONFIRM;
}

export function isClearConfirming(state) {
  return isClearPinsConfirming(state) || isClearImageConfirming(state);
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
    canPasteImage = false,
    pinCount = 0,
    clearConfirmationTimeoutMs = PANEL_ACTION_DEFAULTS.clearConfirmationTimeoutMs,
  } = PANEL_ACTION_DEFAULTS,
) {
  const pasteArmed = isPasteArmed(state);
  const clearPinsConfirming = isClearPinsConfirming(state);
  const clearImageConfirming = isClearImageConfirming(state);
  const clearConfirming = clearPinsConfirming || clearImageConfirming;
  const hasActiveAction = hasActivePanelAction(state);
  const canClearPins = pinCount > 0;
  const shouldResetForMissingPins = clearPinsConfirming && !canClearPins;
  return {
    hasImage,
    canPasteImage,
    pinCount,
    isIdle: isPanelActionIdle(state),
    hasActiveAction,
    pasteArmed,
    clearPinsConfirming,
    clearImageConfirming,
    clearConfirming,
    canClearPins,
    shouldReset: (!hasImage && hasActiveAction) || shouldResetForMissingPins,
    shouldAttachPasteListener: pasteArmed,
    autoResetTimeoutMs: clearConfirming ? clearConfirmationTimeoutMs : null,
  };
}

function createPanelActionState(kind, sessionId) {
  return {
    kind,
    sessionId,
  };
}
