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

export function resolveUiViewModel({
  uiState,
}) {
  const actionSemantics = resolveUiPanelActionSemantics(uiState);
  const panelActionPresentation = resolvePanelActionPresentation({
    actionSemantics,
  });

  return {
    actionSemantics,
    presentation: {
      opacityValue: String(uiState.session.opacity),
      modeSwitch: resolveModeSwitchPresentation({
        mode: uiState.session.mode,
        hasImage: actionSemantics.hasImage,
      }),
      hasImage: actionSemantics.hasImage,
      clearButtonLabel: panelActionPresentation.clearButtonLabel,
      clearButtonVariant: panelActionPresentation.clearButtonVariant,
      clearButtonDisabled: panelActionPresentation.clearButtonDisabled,
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
    };
  }
  if (clearPinsConfirming) {
    return {
      label: "Clear pins?",
      variant: "confirm",
      disabled: false,
    };
  }
  if (clearImageConfirming) {
    return {
      label: "Clear image?",
      variant: "confirm",
      disabled: false,
    };
  }
  if (pinCount > 0) {
    return {
      label: resolveClearPinsLabel(pinCount),
      variant: "neutral",
      disabled: false,
    };
  }
  return {
    label: "Clear image",
    variant: "neutral",
    disabled: false,
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
    clearButtonLabel: clearActionPresentation.label,
    clearButtonVariant: clearActionPresentation.variant,
    clearButtonDisabled: clearActionPresentation.disabled,
  };
}

function resolveModeSwitchPresentation({ mode, hasImage }) {
  return {
    checked: mode === UI_MODE_KIND.ALIGN,
    label: mode === UI_MODE_KIND.ALIGN ? "Align" : "Trace",
    ariaLabel: `Mode: ${mode === UI_MODE_KIND.ALIGN ? "Align" : "Trace"}`,
    disabled: !hasImage,
  };
}
