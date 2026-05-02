import { UI_EFFECT_KIND } from "./ui-effect-model.js";
import { UI_EVENT_KIND } from "./ui-event-model.js";
import {
  createInitialUiState,
  UI_MODE_KIND,
  UI_PANEL_INTENT_KIND,
} from "./ui-state-model.js";
import { createUiTransitionResult } from "./ui-transition-result.js";
import {
  isClearConfirmationPanelIntent,
  isPasteArmedPanelIntent,
} from "./panel-state.js";
import {
  resolveSessionRegistrationAffordances,
} from "./ui-registration-semantics.js";
import { transitionClearPins } from "./ui-registration-transition.js";
import { createDefaultRegistration } from "./state.js";

const UI_MAIN_ACTION_TARGET_KIND = Object.freeze({
  PASTE: "paste",
  CLEAR_PINS: "clear-pins",
  CLEAR_IMAGE: "clear-image",
});

const UI_MAIN_ACTION_PRESENTATION_KIND = Object.freeze({
  NEUTRAL: "neutral",
  CONFIRM: "confirm",
});

const UI_MAIN_ACTION_CONFIRM_INTENT = Object.freeze({
  [UI_MAIN_ACTION_TARGET_KIND.PASTE]: UI_PANEL_INTENT_KIND.PASTE_ARMED,
  [UI_MAIN_ACTION_TARGET_KIND.CLEAR_PINS]: UI_PANEL_INTENT_KIND.CLEAR_PINS_CONFIRM,
  [UI_MAIN_ACTION_TARGET_KIND.CLEAR_IMAGE]: UI_PANEL_INTENT_KIND.CLEAR_IMAGE_CONFIRM,
});

function resolveMainActionTarget(registrationUi) {
  return registrationUi.canClearPins
    ? UI_MAIN_ACTION_TARGET_KIND.CLEAR_PINS
    : registrationUi.hasImage
      ? UI_MAIN_ACTION_TARGET_KIND.CLEAR_IMAGE
      : UI_MAIN_ACTION_TARGET_KIND.PASTE;
}

export function resolveMainActionDescriptor(uiState) {
  const intent = uiState.panel.intent;
  const registrationUi = resolveSessionRegistrationAffordances(uiState.session);
  const target = resolveMainActionTarget(registrationUi);
  const {
    hasImage,
    pinCount,
    canPasteImage,
    canClearPins,
  } = registrationUi;
  const shouldReset = shouldResetMainActionIntent({
    intent,
    target,
    canPasteImage,
    canClearPins,
  });
  const effectiveIntent = shouldReset ? UI_PANEL_INTENT_KIND.IDLE : intent;
  const descriptorBase = {
    hasImage,
    pinCount,
    intent: effectiveIntent,
    target,
    shouldReset,
  };

  if (target === UI_MAIN_ACTION_TARGET_KIND.PASTE) {
    return {
      ...descriptorBase,
      disabled: !canPasteImage,
      label: effectiveIntent === UI_PANEL_INTENT_KIND.PASTE_ARMED ? "Paste…" : "Paste",
      presentationKind: UI_MAIN_ACTION_PRESENTATION_KIND.NEUTRAL,
    };
  }

  if (effectiveIntent === UI_PANEL_INTENT_KIND.CLEAR_PINS_CONFIRM) {
    return {
      ...descriptorBase,
      disabled: !canClearPins,
      label: "Clear pins?",
      presentationKind: UI_MAIN_ACTION_PRESENTATION_KIND.CONFIRM,
    };
  }

  if (effectiveIntent === UI_PANEL_INTENT_KIND.CLEAR_IMAGE_CONFIRM) {
    return {
      ...descriptorBase,
      disabled: false,
      label: "Clear image?",
      presentationKind: UI_MAIN_ACTION_PRESENTATION_KIND.CONFIRM,
    };
  }

  if (target === UI_MAIN_ACTION_TARGET_KIND.CLEAR_PINS) {
    return {
      ...descriptorBase,
      disabled: !canClearPins,
      label: resolveClearPinsLabel(pinCount),
      presentationKind: UI_MAIN_ACTION_PRESENTATION_KIND.NEUTRAL,
    };
  }

  return {
    ...descriptorBase,
    disabled: false,
    label: "Clear image",
    presentationKind: UI_MAIN_ACTION_PRESENTATION_KIND.NEUTRAL,
  };
}

function shouldResetMainActionIntent({
  intent,
  target,
  canPasteImage,
  canClearPins,
}) {
  return (
    (intent === UI_PANEL_INTENT_KIND.PASTE_ARMED && (
      target !== UI_MAIN_ACTION_TARGET_KIND.PASTE ||
      !canPasteImage
    )) ||
    (intent === UI_PANEL_INTENT_KIND.CLEAR_PINS_CONFIRM && (
      target !== UI_MAIN_ACTION_TARGET_KIND.CLEAR_PINS ||
      !canClearPins
    )) ||
    (intent === UI_PANEL_INTENT_KIND.CLEAR_IMAGE_CONFIRM && target !== UI_MAIN_ACTION_TARGET_KIND.CLEAR_IMAGE)
  );
}

export function transitionMainAction(uiState, event) {
  switch (event?.kind) {
    case UI_EVENT_KIND.MAIN_ACTION_TRIGGERED:
      return transitionMainActionTriggered(uiState);
    case UI_EVENT_KIND.PANEL_TIMEOUT_ELAPSED:
      return transitionPanelTimeoutElapsed(uiState);
    case UI_EVENT_KIND.PASTE_SUCCEEDED:
      return transitionPasteSucceeded(uiState, event);
    case UI_EVENT_KIND.PASTE_CANCELLED:
    case UI_EVENT_KIND.PASTE_FAILED:
      return transitionPasteEnded(uiState);
    default:
      return createUiTransitionResult(uiState);
  }
}

function transitionMainActionTriggered(uiState) {
  const action = resolveMainActionDescriptor(uiState);

  if (action.shouldReset) {
    return createUiTransitionResult(
      patchPanelIntent(uiState, UI_PANEL_INTENT_KIND.IDLE),
    );
  }

  if (isPasteArmedPanelIntent(action.intent)) {
    return createUiTransitionResult(
      patchPanelIntent(uiState, UI_PANEL_INTENT_KIND.IDLE),
      [UI_EFFECT_KIND.SHOW_PASTE_CANCELLED_FEEDBACK],
    );
  }

  if (action.disabled) {
    return createUiTransitionResult(uiState);
  }

  if (action.target === UI_MAIN_ACTION_TARGET_KIND.PASTE) {
    return createUiTransitionResult(
      patchPanelIntent(uiState, UI_PANEL_INTENT_KIND.PASTE_ARMED),
      [UI_EFFECT_KIND.REQUEST_PASTE_INPUT],
    );
  }

  if (action.intent === UI_PANEL_INTENT_KIND.CLEAR_PINS_CONFIRM) {
    return transitionClearPins(uiState);
  }

  if (action.intent === UI_PANEL_INTENT_KIND.CLEAR_IMAGE_CONFIRM) {
    return createUiTransitionResult(
      resetToClearedImageSession(uiState),
      [
        UI_EFFECT_KIND.CANCEL_PANEL_TIMEOUT,
        UI_EFFECT_KIND.CLEAR_IMAGE,
      ],
    );
  }

  return createUiTransitionResult(
    patchPanelIntent(uiState, UI_MAIN_ACTION_CONFIRM_INTENT[action.target]),
    [UI_EFFECT_KIND.START_PANEL_TIMEOUT],
  );
}

function transitionPanelTimeoutElapsed(uiState) {
  const intent = uiState.panel.intent;
  if (!isClearConfirmationPanelIntent(intent)) {
    return createUiTransitionResult(uiState);
  }
  return createUiTransitionResult(
    patchPanelIntent(uiState, UI_PANEL_INTENT_KIND.IDLE),
  );
}

function transitionPasteSucceeded(uiState, event) {
  if (!isPasteArmedPanelIntent(uiState.panel.intent)) {
    return createUiTransitionResult(uiState);
  }

  return createUiTransitionResult({
    ...uiState,
    session: {
      ...uiState.session,
      mode: UI_MODE_KIND.ALIGN,
      image: event.image ?? null,
      placement: event.placement ?? null,
      registration: createDefaultRegistration(),
    },
    panel: {
      ...uiState.panel,
      intent: UI_PANEL_INTENT_KIND.IDLE,
    },
  });
}

function transitionPasteEnded(uiState) {
  if (!isPasteArmedPanelIntent(uiState.panel.intent)) {
    return createUiTransitionResult(uiState);
  }
  return createUiTransitionResult(
    patchPanelIntent(uiState, UI_PANEL_INTENT_KIND.IDLE),
  );
}

function patchPanelIntent(uiState, nextIntent) {
  if (uiState.panel.intent === nextIntent) {
    return uiState;
  }
  return {
    ...uiState,
    panel: {
      ...uiState.panel,
      intent: nextIntent,
    },
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

function resetToClearedImageSession(uiState) {
  const clearedState = createInitialUiState();
  return {
    ...uiState,
    session: clearedState.session,
    panel: {
      ...uiState.panel,
      intent: UI_PANEL_INTENT_KIND.IDLE,
    },
  };
}
