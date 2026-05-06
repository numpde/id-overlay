import {
  MACHINE_EFFECT_KIND,
  MACHINE_PASTE_SOURCE,
  createReadPasteImageResult,
} from "./effects.js";

export function createMachineEffectRunner({
  readPasteImage = null,
  startManualPasteCapture = null,
  cancelManualPasteCapture = null,
  startPanelTimeout = null,
  cancelPanelTimeout = null,
  startStatusTimeout = null,
  cancelStatusTimeout = null,
  completeEffect = null,
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
      case MACHINE_EFFECT_KIND.START_MANUAL_PASTE_CAPTURE:
        return runManualPasteCapture(effect, context);
      case MACHINE_EFFECT_KIND.CANCEL_MANUAL_PASTE_CAPTURE:
        return cancelManualPasteCapture?.({
          requestId: effect.requestId,
          context,
        });
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
      case MACHINE_EFFECT_KIND.START_STATUS_TIMEOUT:
        return startStatusTimeout?.({
          requestId: effect.requestId,
          context,
        });
      case MACHINE_EFFECT_KIND.CANCEL_STATUS_TIMEOUT:
        return cancelStatusTimeout?.({
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
    const outcome = await readPasteImage({
      requestId: effect.requestId,
      context,
    });
    completePasteRead({
      outcome,
      requestId: effect.requestId,
      source: MACHINE_PASTE_SOURCE.CLIPBOARD_API,
    });
  }

  async function runManualPasteCapture(effect, context) {
    if (!startManualPasteCapture) {
      return;
    }
    const outcome = await startManualPasteCapture({
      requestId: effect.requestId,
      context,
    });
    completePasteRead({
      outcome,
      requestId: effect.requestId,
      source: MACHINE_PASTE_SOURCE.MANUAL_PASTE,
    });
  }

  function completePasteRead({ outcome, requestId, source }) {
    completeEffect?.(createReadPasteImageResult({
      requestId,
      source,
      outcome,
    }));
  }

  function reportError(error, payload) {
    onError?.(error, payload);
  }
}
