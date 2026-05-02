import {
  hasOverlayImageSession,
  resolveRegistrationSolveState,
} from "./state.js";
import { resolveRegistrationUiPolicy } from "./interaction-policy.js";

export function resolveSessionRegistrationAffordances(sessionState) {
  // Final semantic-history shape: keep this as a selector over canonical
  // session state. It should not duplicate transition validity or decide
  // history posture for registration actions.
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
