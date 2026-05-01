import {
  UI_MODE_KIND,
  UI_PANEL_INTENT_KIND,
} from "./ui-state-model.js";
import {
  resolveMainActionDescriptor,
} from "./ui-main-action-transition.js";
import {
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
  const pasteArmed = uiState.panel.intent === UI_PANEL_INTENT_KIND.PASTE_ARMED;
  const clearPinsConfirming = uiState.panel.intent === UI_PANEL_INTENT_KIND.CLEAR_PINS_CONFIRM;
  const clearImageConfirming = uiState.panel.intent === UI_PANEL_INTENT_KIND.CLEAR_IMAGE_CONFIRM;
  const clearConfirming = clearPinsConfirming || clearImageConfirming;
  const mainAction = resolveMainActionDescriptor(uiState);

  return {
    hasImage: registrationFacts.hasImage,
    canPasteImage: mainAction.canPasteImage,
    pinCount: registrationFacts.pinCount,
    isIdle: uiState.panel.intent === UI_PANEL_INTENT_KIND.IDLE,
    hasActiveAction: uiState.panel.intent !== UI_PANEL_INTENT_KIND.IDLE,
    pasteArmed,
    clearPinsConfirming,
    clearImageConfirming,
    clearConfirming,
    canClearPins: mainAction.canClearPins,
    shouldReset: mainAction.shouldReset,
    shouldAttachPasteListener: pasteArmed,
    mainAction,
  };
}

function resolvePanelActionPresentation({ actionSemantics }) {
  return {
    clearButtonLabel: actionSemantics.mainAction.label,
    clearButtonVariant: actionSemantics.mainAction.presentationKind,
    clearButtonDisabled: actionSemantics.mainAction.disabled,
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
