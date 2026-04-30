import {
  UI_MODE_KIND,
  UI_PANEL_INTENT_KIND,
} from "./ui-state-model.js";
import {
  resolveMainActionBasis,
  shouldResetMainActionIntent,
} from "./ui-main-action-transition.js";
import {
  canPasteUiImage,
  canClearUiPins,
  resolveUiRegistrationFacts,
} from "./ui-registration-semantics.js";

export const PANEL_TITLE = "Reference Overlay";
export const PANEL_REPO_URL = "https://github.com/numpde/id-overlay";
export const MANUAL_PASTE_PROMPT = "Press Ctrl/Cmd+V to paste an image from your clipboard.";
export const CLEAR_PINS_CONFIRMATION_MESSAGE = "Click Clear pins? again to remove the current registration pins.";
export const CLEAR_IMAGE_CONFIRMATION_MESSAGE = "Click Clear image? again to remove the current screenshot, placement, and pins.";

export function resolveUiViewModel({
  uiState,
  statusMessage,
}) {
  const actionSemantics = resolveUiPanelActionSemantics(uiState);
  const panelActionPresentation = resolvePanelActionPresentation({
    actionSemantics,
  });

  return {
    actionSemantics,
    presentation: {
      pasteLabel: panelActionPresentation.pasteLabel,
      opacityValue: String(uiState.session.opacity),
      modeSwitch: resolveModeSwitchPresentation(uiState.session.mode),
      hasImage: actionSemantics.hasImage,
      canPasteImage: actionSemantics.canPasteImage,
      canClearPins: actionSemantics.canClearPins,
      clearPinsLabel: resolveClearPinsLabel(actionSemantics.pinCount),
      clearButtonLabel: panelActionPresentation.clearButtonLabel,
      clearButtonVariant: panelActionPresentation.clearButtonVariant,
      clearButtonDisabled: panelActionPresentation.clearButtonDisabled,
      statusMessage: (
        panelActionPresentation.statusMessage ??
        statusMessage
      ),
    },
  };
}

function resolveUiPanelActionSemantics(uiState) {
  const registrationFacts = resolveUiRegistrationFacts(uiState);
  const canPasteImage = canPasteUiImage(uiState);
  const pasteArmed = uiState.panel.intent === UI_PANEL_INTENT_KIND.PASTE_ARMED;
  const clearPinsConfirming = uiState.panel.intent === UI_PANEL_INTENT_KIND.CLEAR_PINS_CONFIRM;
  const clearImageConfirming = uiState.panel.intent === UI_PANEL_INTENT_KIND.CLEAR_IMAGE_CONFIRM;
  const clearConfirming = clearPinsConfirming || clearImageConfirming;
  const mainActionBasis = resolveMainActionBasis(uiState);

  return {
    hasImage: registrationFacts.hasImage,
    canPasteImage,
    pinCount: registrationFacts.pinCount,
    isIdle: uiState.panel.intent === UI_PANEL_INTENT_KIND.IDLE,
    hasActiveAction: uiState.panel.intent !== UI_PANEL_INTENT_KIND.IDLE,
    pasteArmed,
    clearPinsConfirming,
    clearImageConfirming,
    clearConfirming,
    canClearPins: canClearUiPins(uiState),
    shouldReset: shouldResetMainActionIntent(mainActionBasis),
    shouldAttachPasteListener: pasteArmed,
  };
}

function resolveClearPinsLabel(pinCount) {
  if (pinCount === 1) {
    return "Clear 1 pin";
  }
  if (pinCount > 1) {
    return `Clear ${pinCount} pins`;
  }
  return "Clear pins";
}

function resolveClearActionPresentation({
  hasImage,
  canPasteImage,
  pasteArmed,
  pinCount,
  clearPinsConfirming,
  clearImageConfirming,
}) {
  if (!hasImage) {
    return {
      label: pasteArmed ? "Paste…" : "Paste",
      variant: "neutral",
      disabled: !canPasteImage,
      statusMessage: null,
    };
  }
  if (clearPinsConfirming) {
    return {
      label: "Clear pins?",
      variant: "confirm",
      disabled: false,
      statusMessage: CLEAR_PINS_CONFIRMATION_MESSAGE,
    };
  }
  if (clearImageConfirming) {
    return {
      label: "Clear image?",
      variant: "confirm",
      disabled: false,
      statusMessage: CLEAR_IMAGE_CONFIRMATION_MESSAGE,
    };
  }
  if (pinCount > 0) {
    return {
      label: resolveClearPinsLabel(pinCount),
      variant: "neutral",
      disabled: false,
      statusMessage: null,
    };
  }
  return {
    label: "Clear image",
    variant: "neutral",
    disabled: false,
    statusMessage: null,
  };
}

function resolveClearImagePresentation({ hasImage, isConfirming }) {
  return {
    label: isConfirming ? "Clear image?" : "Clear image",
    variant: isConfirming ? "confirm" : "neutral",
    disabled: !hasImage,
    statusMessage: isConfirming ? CLEAR_IMAGE_CONFIRMATION_MESSAGE : null,
  };
}

function resolvePanelActionPresentation({ actionSemantics }) {
  const clearActionPresentation = resolveClearActionPresentation({
    hasImage: actionSemantics.hasImage,
    canPasteImage: actionSemantics.canPasteImage,
    pasteArmed: actionSemantics.pasteArmed,
    pinCount: actionSemantics.pinCount,
    clearPinsConfirming: actionSemantics.clearPinsConfirming,
    clearImageConfirming: actionSemantics.clearImageConfirming,
  });
  return {
    pasteLabel: actionSemantics.pasteArmed ? "Paste…" : "Paste",
    clearButtonLabel: clearActionPresentation.label,
    clearButtonVariant: clearActionPresentation.variant,
    clearButtonDisabled: clearActionPresentation.disabled,
    statusMessage: actionSemantics.pasteArmed
      ? MANUAL_PASTE_PROMPT
      : clearActionPresentation.statusMessage,
  };
}

function resolveModeSwitchPresentation(mode) {
  return {
    checked: mode === UI_MODE_KIND.ALIGN,
    label: mode === UI_MODE_KIND.ALIGN ? "Align" : "Trace",
    ariaLabel: `Mode: ${mode === UI_MODE_KIND.ALIGN ? "Align" : "Trace"}`,
  };
}
