import { MACHINE_EFFECT_KIND } from "./effects.js";
import { MACHINE_EVENT_KIND } from "./events.js";

export function createMachineEffectRunner({
  readPasteImage = null,
  startPanelTimeout = null,
  cancelPanelTimeout = null,
  dispatch = null,
  getState = null,
  onError = null,
} = {}) {
  return async function runMachineEffect(effect, context = {}) {
    try {
      await runEffect(effect, context);
    } catch (error) {
      reportError(error, { effect, context });
    }
  };

  async function runEffect(effect, context) {
    switch (effect?.kind) {
      case MACHINE_EFFECT_KIND.READ_PASTE_IMAGE:
        return runReadPasteImage(effect, context);
      case MACHINE_EFFECT_KIND.START_PANEL_TIMEOUT:
        return startPanelTimeout?.({
          intent: effect.intent,
          requestId: effect.requestId,
          context,
        });
      case MACHINE_EFFECT_KIND.CANCEL_PANEL_TIMEOUT:
        return cancelPanelTimeout?.({
          requestId: effect.requestId,
          context,
        });
      default:
        return undefined;
    }
  }

  async function runReadPasteImage(effect, context) {
    if (!readPasteImage) {
      return;
    }
    const image = await readPasteImage?.({
      requestId: effect.requestId,
      context,
    });
    if (!isCurrentRequest(effect.requestId)) {
      return;
    }
    if (image) {
      dispatch?.({
        type: MACHINE_EVENT_KIND.LOAD_IMAGE,
        image,
        placement: null,
        requestId: effect.requestId,
      });
      return;
    }
    dispatch?.({
      type: MACHINE_EVENT_KIND.CANCEL_PANEL_INTENT,
      requestId: effect.requestId,
    });
  }

  function isCurrentRequest(requestId) {
    return getState?.()?.panel?.requestId === requestId;
  }

  function reportError(error, payload) {
    onError?.(error, payload);
  }
}
