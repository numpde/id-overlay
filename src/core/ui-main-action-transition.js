import { UI_EFFECT_KIND } from "./ui-effect-model.js";
import { UI_EVENT_KIND } from "./ui-event-model.js";
import {
  createInitialUiState,
  UI_MODE_KIND,
  UI_PANEL_INTENT_KIND,
} from "./ui-state-model.js";

export const UI_MAIN_ACTION_TARGET_KIND = Object.freeze({
  PASTE: "paste",
  CLEAR_PINS: "clear-pins",
  CLEAR_IMAGE: "clear-image",
});

export function resolveMainActionTarget(uiState) {
  return hasPins(uiState)
    ? UI_MAIN_ACTION_TARGET_KIND.CLEAR_PINS
    : hasImage(uiState)
      ? UI_MAIN_ACTION_TARGET_KIND.CLEAR_IMAGE
      : UI_MAIN_ACTION_TARGET_KIND.PASTE;
}

export function resolveMainActionBasis(uiState) {
  return {
    intent: uiState.panel.intent,
    target: resolveMainActionTarget(uiState),
    canPasteImage: canPasteImage(uiState),
  };
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
      return createTransitionResult(uiState);
  }
}

function transitionMainActionTriggered(uiState) {
  const basis = resolveMainActionBasis(uiState);

  if (isStaleMainActionIntent(basis)) {
    return createTransitionResult(
      patchPanelIntent(uiState, UI_PANEL_INTENT_KIND.IDLE),
    );
  }

  if (basis.intent === UI_PANEL_INTENT_KIND.PASTE_ARMED) {
    return createTransitionResult(
      patchPanelIntent(uiState, UI_PANEL_INTENT_KIND.IDLE),
    );
  }

  if (basis.target === UI_MAIN_ACTION_TARGET_KIND.PASTE) {
    if (!basis.canPasteImage) {
      return createTransitionResult(uiState);
    }
    return createTransitionResult(
      patchPanelIntent(uiState, UI_PANEL_INTENT_KIND.PASTE_ARMED),
      [UI_EFFECT_KIND.REQUEST_PASTE_INPUT],
    );
  }

  if (basis.intent === UI_PANEL_INTENT_KIND.CLEAR_PINS_CONFIRM) {
    return createTransitionResult(
      patchRegistration(uiState, createEmptyRegistration(), {
        panelIntent: UI_PANEL_INTENT_KIND.IDLE,
      }),
      [UI_EFFECT_KIND.CANCEL_PANEL_TIMEOUT],
    );
  }

  if (basis.intent === UI_PANEL_INTENT_KIND.CLEAR_IMAGE_CONFIRM) {
    return createTransitionResult(
      resetToClearedImageSession(uiState),
      [UI_EFFECT_KIND.CANCEL_PANEL_TIMEOUT],
    );
  }

  const nextIntent = basis.target === UI_MAIN_ACTION_TARGET_KIND.CLEAR_PINS
    ? UI_PANEL_INTENT_KIND.CLEAR_PINS_CONFIRM
    : UI_PANEL_INTENT_KIND.CLEAR_IMAGE_CONFIRM;

  return createTransitionResult(
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
    return createTransitionResult(uiState);
  }
  return createTransitionResult(
    patchPanelIntent(uiState, UI_PANEL_INTENT_KIND.IDLE),
  );
}

function transitionPasteSucceeded(uiState, event) {
  if (uiState.panel.intent !== UI_PANEL_INTENT_KIND.PASTE_ARMED) {
    return createTransitionResult(uiState);
  }

  return createTransitionResult({
    ...uiState,
    session: {
      ...uiState.session,
      mode: UI_MODE_KIND.ALIGN,
      image: event.image ?? null,
      placement: event.placement ?? null,
      registration: createEmptyRegistration(),
    },
    panel: {
      ...uiState.panel,
      intent: UI_PANEL_INTENT_KIND.IDLE,
    },
  });
}

function transitionPasteEnded(uiState) {
  if (uiState.panel.intent !== UI_PANEL_INTENT_KIND.PASTE_ARMED) {
    return createTransitionResult(uiState);
  }
  return createTransitionResult(
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

function patchRegistration(uiState, registration, { panelIntent = uiState.panel.intent } = {}) {
  return {
    ...uiState,
    session: {
      ...uiState.session,
      registration,
    },
    panel: {
      ...uiState.panel,
      intent: panelIntent,
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

function isStaleMainActionIntent({ intent, target }) {
  return (
    (intent === UI_PANEL_INTENT_KIND.PASTE_ARMED && target !== UI_MAIN_ACTION_TARGET_KIND.PASTE) ||
    (intent === UI_PANEL_INTENT_KIND.CLEAR_PINS_CONFIRM && target !== UI_MAIN_ACTION_TARGET_KIND.CLEAR_PINS) ||
    (intent === UI_PANEL_INTENT_KIND.CLEAR_IMAGE_CONFIRM && target !== UI_MAIN_ACTION_TARGET_KIND.CLEAR_IMAGE)
  );
}

function createTransitionResult(state, effects = []) {
  return {
    state,
    effects: Object.freeze([...effects]),
  };
}

function hasImage(uiState) {
  return uiState.session.image !== null;
}

function hasPins(uiState) {
  return uiState.session.registration.pins.length > 0;
}

function canPasteImage(uiState) {
  return uiState.session.mode === UI_MODE_KIND.ALIGN;
}

function createEmptyRegistration() {
  return {
    pins: [],
    solvedTransform: null,
    dirty: false,
  };
}
