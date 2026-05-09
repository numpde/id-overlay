import { createPasteEffectHandlers } from "./paste-effect-handlers.js";
import { createTimerEffectHandlers } from "./timer-effect-handlers.js";

export function createMachineEffectRunner(options = {}) {
  const { onError = null } = options;
  const handlers = {
    ...createPasteEffectHandlers(options),
    ...createTimerEffectHandlers(options),
  };

  return async function runMachineEffect(effect, context = {}) {
    try {
      await handlers[effect?.kind]?.(effect, context);
    } catch (error) {
      reportError(error, { effect, context });
    }
  };

  function reportError(error, payload) {
    onError?.(error, payload);
  }
}
