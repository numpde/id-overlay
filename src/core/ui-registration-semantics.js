import {
  createDefaultRegistration,
  hasOverlayImageSession,
  resolveRegistrationSolveState,
} from "./state.js";
import { resolveRegistrationUiPolicy } from "./interaction-policy.js";

export function createClearedUiRegistration() {
  return createDefaultRegistration();
}

export function resolveSessionRegistrationAffordances(sessionState) {
  const solveState = resolveRegistrationSolveState(sessionState.registration);
  const registrationUi = resolveRegistrationUiPolicy(sessionState);
  const hasImage = hasOverlayImageSession(sessionState);
  return {
    hasImage,
    pinCount: solveState.pinCount,
    canPasteImage: registrationUi.canPasteImage,
    canShowPins: registrationUi.canShowPins,
    canClearPins: (
      hasImage &&
      registrationUi.registrationModeActive &&
      solveState.pinCount > 0
    ),
  };
}

export function resolveUiRegistrationFacts(uiState) {
  const {
    hasImage,
    pinCount,
  } = resolveSessionRegistrationAffordances(uiState.session);
  return {
    hasImage,
    pinCount,
  };
}

export function canPasteUiImage(uiState) {
  return resolveSessionRegistrationAffordances(uiState.session).canPasteImage;
}

export function canClearUiPins(uiState) {
  return resolveSessionRegistrationAffordances(uiState.session).canClearPins;
}
