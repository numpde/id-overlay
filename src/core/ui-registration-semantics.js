import {
  createDefaultRegistration,
  hasOverlayImageSession,
  resolveRegistrationSolveState,
} from "./state.js";
import { resolveRegistrationUiPolicy } from "./interaction-policy.js";

export function createClearedUiRegistration() {
  return createDefaultRegistration();
}

export function resolveUiRegistrationFacts(uiState) {
  const solveState = resolveRegistrationSolveState(uiState.session.registration);
  return {
    hasImage: hasOverlayImageSession(uiState.session),
    pinCount: solveState.pinCount,
  };
}

export function canPasteUiImage(uiState) {
  return resolveRegistrationUiPolicy(uiState.session).canPasteImage;
}

export function canClearUiPins(uiState) {
  const { hasImage, pinCount } = resolveUiRegistrationFacts(uiState);
  const registrationUi = resolveRegistrationUiPolicy(uiState.session);
  return (
    hasImage &&
    registrationUi.canPasteImage &&
    pinCount > 0
  );
}
