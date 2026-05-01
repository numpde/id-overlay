import { UI_EFFECT_KIND } from "./ui-effect-model.js";

export async function runUiLiveEffects({
  previousUiState,
  nextUiState,
  effects,
}, handlers) {
  const requestSolve = effects.includes(UI_EFFECT_KIND.REQUEST_REGISTRATION_SOLVE);
  const previousMode = previousUiState?.session?.mode ?? null;
  const nextMode = nextUiState?.session?.mode ?? previousMode;

  if ((previousMode !== nextMode || requestSolve) && nextMode) {
    await handlers.applyResolvedModeTransition({
      nextMode,
      requestSolve,
    });
  }

  for (const effectKind of effects) {
    switch (effectKind) {
      case UI_EFFECT_KIND.REQUEST_PASTE_INPUT:
        await handlers.requestPasteInput();
        break;
      case UI_EFFECT_KIND.REQUEST_REGISTRATION_SOLVE:
        break;
      case UI_EFFECT_KIND.CLEAR_PINS:
        await handlers.clearPins();
        break;
      case UI_EFFECT_KIND.CLEAR_IMAGE:
        await handlers.clearImage();
        break;
      case UI_EFFECT_KIND.UNDO_SESSION:
        await handlers.undoSession();
        break;
      case UI_EFFECT_KIND.REDO_SESSION:
        await handlers.redoSession();
        break;
      case UI_EFFECT_KIND.SHOW_PASTE_CANCELLED_FEEDBACK:
        await handlers.showPasteCancelledFeedback();
        break;
      case UI_EFFECT_KIND.START_PANEL_TIMEOUT:
        await handlers.startPanelTimeout();
        break;
      case UI_EFFECT_KIND.CANCEL_PANEL_TIMEOUT:
        await handlers.cancelPanelTimeout();
        break;
      default:
        break;
    }
  }
}
