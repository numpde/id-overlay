import { MACHINE_EFFECT_KIND } from "./effect-requests.js";
import { createReadPasteImageResult } from "./effect-results.js";
import { MACHINE_PASTE_SOURCE } from "./paste-read.js";

export function createPasteEffectHandlers({
  readPasteImage = null,
  startManualPasteCapture = null,
  cancelManualPasteCapture = null,
  completeEffect = null,
} = {}) {
  return {
    [MACHINE_EFFECT_KIND.READ_PASTE_IMAGE]: (effect, context) => runPasteReadEffect({
      adapter: readPasteImage,
      completeEffect,
      context,
      effect,
      source: MACHINE_PASTE_SOURCE.CLIPBOARD_API,
    }),
    [MACHINE_EFFECT_KIND.START_MANUAL_PASTE_CAPTURE]: (effect, context) => runPasteReadEffect({
      adapter: startManualPasteCapture,
      completeEffect,
      context,
      effect,
      source: MACHINE_PASTE_SOURCE.MANUAL_PASTE,
    }),
    [MACHINE_EFFECT_KIND.CANCEL_MANUAL_PASTE_CAPTURE]: (effect, context) => (
      cancelManualPasteCapture?.({
        requestId: effect.requestId,
        context,
      })
    ),
  };
}

async function runPasteReadEffect({
  adapter,
  completeEffect,
  context,
  effect,
  source,
}) {
  if (!adapter) {
    return;
  }
  const outcome = await adapter({
    requestId: effect.requestId,
    context,
  });
  completePasteRead({
    completeEffect,
    outcome,
    requestId: effect.requestId,
    source,
  });
}

function completePasteRead({ completeEffect, outcome, requestId, source }) {
  completeEffect?.(createReadPasteImageResult({
    requestId,
    source,
    outcome,
  }));
}
