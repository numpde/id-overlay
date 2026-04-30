import { UI_EFFECT_KIND } from "./ui-effect-model.js";
import { UI_EVENT_KIND } from "./ui-event-model.js";
import {
  createInitialUiState,
  UI_MODE_KIND,
  UI_PANEL_INTENT_KIND,
} from "./ui-state-model.js";
import { createUiTransitionResult } from "./ui-transition-result.js";
import {
  canPasteUiImage,
  createClearedUiRegistration,
  resolveUiRegistrationFacts,
} from "./ui-registration-semantics.js";
import { transitionClearPins } from "./ui-registration-transition.js";

export const UI_MAIN_ACTION_TARGET_KIND = Object.freeze({
  PASTE: "paste",
  CLEAR_PINS: "clear-pins",
  CLEAR_IMAGE: "clear-image",
});

export function resolveMainActionTarget(uiState) {
  const registrationFacts = resolveUiRegistrationFacts(uiState);
  return registrationFacts.pinCount > 0
    ? UI_MAIN_ACTION_TARGET_KIND.CLEAR_PINS
    : registrationFacts.hasImage
      ? UI_MAIN_ACTION_TARGET_KIND.CLEAR_IMAGE
      : UI_MAIN_ACTION_TARGET_KIND.PASTE;
}

export function resolveMainActionBasis(uiState) {
  return {
    intent: uiState.panel.intent,
    target: resolveMainActionTarget(uiState),
    canPasteImage: canPasteUiImage(uiState),
  };
}

export function shouldResetMainActionIntent({
  intent,
  target,
  canPasteImage,
}) {
  return (
    (intent === UI_PANEL_INTENT_KIND.PASTE_ARMED && (
      target !== UI_MAIN_ACTION_TARGET_KIND.PASTE ||
      !canPasteImage
    )) ||
    (intent === UI_PANEL_INTENT_KIND.CLEAR_PINS_CONFIRM && target !== UI_MAIN_ACTION_TARGET_KIND.CLEAR_PINS) ||
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
  const basis = resolveMainActionBasis(uiState);

  if (shouldResetMainActionIntent(basis)) {
    return createUiTransitionResult(
      patchPanelIntent(uiState, UI_PANEL_INTENT_KIND.IDLE),
    );
  }

  if (basis.intent === UI_PANEL_INTENT_KIND.PASTE_ARMED) {
    return createUiTransitionResult(
      patchPanelIntent(uiState, UI_PANEL_INTENT_KIND.IDLE),
    );
  }

  if (basis.target === UI_MAIN_ACTION_TARGET_KIND.PASTE) {
    if (!basis.canPasteImage) {
      return createUiTransitionResult(uiState);
    }
    return createUiTransitionResult(
      patchPanelIntent(uiState, UI_PANEL_INTENT_KIND.PASTE_ARMED),
      [UI_EFFECT_KIND.REQUEST_PASTE_INPUT],
    );
  }

  if (basis.intent === UI_PANEL_INTENT_KIND.CLEAR_PINS_CONFIRM) {
    return transitionClearPins(uiState);
  }

  if (basis.intent === UI_PANEL_INTENT_KIND.CLEAR_IMAGE_CONFIRM) {
    return createUiTransitionResult(
      resetToClearedImageSession(uiState),
      [
        UI_EFFECT_KIND.CANCEL_PANEL_TIMEOUT,
        UI_EFFECT_KIND.CLEAR_IMAGE,
      ],
    );
  }

  const nextIntent = basis.target === UI_MAIN_ACTION_TARGET_KIND.CLEAR_PINS
    ? UI_PANEL_INTENT_KIND.CLEAR_PINS_CONFIRM
    : UI_PANEL_INTENT_KIND.CLEAR_IMAGE_CONFIRM;

  return createUiTransitionResult(
    patchPanelIntent(uiState, nextIntent),
    [UI_EFFECT_KIND.START_PANEL_TIMEOUT],
  );
}

function transitionPanelTimeoutElapsed(uiState) {
  const intent = uiState.panel.intent;
  if (
    intent !== UI_PANEL_INTENT_KIND.CLEAR_PINS_CONFIRM &&
    intent !== UI_PANEL_INTENT_KIND.CLEAR_IMAGE_CONFIRM
  ) {
    return createUiTransitionResult(uiState);
  }
  return createUiTransitionResult(
    patchPanelIntent(uiState, UI_PANEL_INTENT_KIND.IDLE),
  );
}

function transitionPasteSucceeded(uiState, event) {
  if (uiState.panel.intent !== UI_PANEL_INTENT_KIND.PASTE_ARMED) {
    return createUiTransitionResult(uiState);
  }

  return createUiTransitionResult({
    ...uiState,
    session: {
      ...uiState.session,
      mode: UI_MODE_KIND.ALIGN,
      image: event.image ?? null,
      placement: event.placement ?? null,
      registration: createClearedUiRegistration(),
    },
    panel: {
      ...uiState.panel,
      intent: UI_PANEL_INTENT_KIND.IDLE,
    },
  });
}

function transitionPasteEnded(uiState) {
  if (uiState.panel.intent !== UI_PANEL_INTENT_KIND.PASTE_ARMED) {
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
