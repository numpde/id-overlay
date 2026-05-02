import { UI_EFFECT_KIND } from "./ui-effect-model.js";

const HANDLER_BY_EFFECT_KIND = Object.freeze({
  [UI_EFFECT_KIND.REQUEST_PASTE_INPUT]: "requestPasteInput",
  [UI_EFFECT_KIND.CLEAR_PINS]: "clearPins",
  [UI_EFFECT_KIND.CLEAR_IMAGE]: "clearImage",
  [UI_EFFECT_KIND.UNDO_SESSION]: "undoSession",
  [UI_EFFECT_KIND.REDO_SESSION]: "redoSession",
  [UI_EFFECT_KIND.SHOW_PASTE_CANCELLED_FEEDBACK]: "showPasteCancelledFeedback",
  [UI_EFFECT_KIND.START_PANEL_TIMEOUT]: "startPanelTimeout",
  [UI_EFFECT_KIND.CANCEL_PANEL_TIMEOUT]: "cancelPanelTimeout",
});

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
    const handlerName = HANDLER_BY_EFFECT_KIND[effectKind];
    if (handlerName) {
      await handlers[handlerName]();
    }
  }
}
