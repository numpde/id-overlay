import { MACHINE_EFFECT_KIND } from "./effect-requests.js";

export function createTimerEffectHandlers({
  startPanelTimeout = null,
  cancelPanelTimeout = null,
  startStatusTimeout = null,
  cancelStatusTimeout = null,
} = {}) {
  return {
    [MACHINE_EFFECT_KIND.START_PANEL_TIMEOUT]: (effect, context) => (
      runRequestEffect(startPanelTimeout, effect, context, { intent: effect.intent })
    ),
    [MACHINE_EFFECT_KIND.CANCEL_PANEL_TIMEOUT]: (effect, context) => (
      runRequestEffect(cancelPanelTimeout, effect, context)
    ),
    [MACHINE_EFFECT_KIND.START_STATUS_TIMEOUT]: (effect, context) => (
      runRequestEffect(startStatusTimeout, effect, context)
    ),
    [MACHINE_EFFECT_KIND.CANCEL_STATUS_TIMEOUT]: (effect, context) => (
      runRequestEffect(cancelStatusTimeout, effect, context)
    ),
  };
}

function runRequestEffect(adapter, effect, context, extra = {}) {
  return adapter?.({
    ...extra,
    requestId: effect.requestId,
    context,
  });
}
