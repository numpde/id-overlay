import { UI_EFFECT_KIND } from "./ui-effect-model.js";

export async function runUiLiveEffects(effects, handlers) {
  for (const effectKind of effects) {
    switch (effectKind) {
      case UI_EFFECT_KIND.REQUEST_PASTE_INPUT:
        await handlers.requestPasteInput();
        break;
      case UI_EFFECT_KIND.CLEAR_PINS:
        await handlers.clearPins();
        break;
      case UI_EFFECT_KIND.CLEAR_IMAGE:
        await handlers.clearImage();
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
