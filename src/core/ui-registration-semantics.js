import {
  hasOverlayImageSession,
  resolveRegistrationSolveState,
} from "./state.js";
import { resolveRegistrationUiPolicy } from "./interaction-policy.js";

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
