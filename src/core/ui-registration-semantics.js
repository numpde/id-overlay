import {
  createDefaultRegistration,
  hasOverlayImageSession,
  resolveRegistrationSolveState,
} from "./state.js";
import { UI_MODE_KIND } from "./ui-state-model.js";

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
  return uiState.session.mode === UI_MODE_KIND.ALIGN;
}

export function canClearUiPins(uiState) {
  const { hasImage, pinCount } = resolveUiRegistrationFacts(uiState);
  return (
    hasImage &&
    canPasteUiImage(uiState) &&
    pinCount > 0
  );
}
