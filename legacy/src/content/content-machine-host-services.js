import { createContentPasteEffectService } from "./paste-effect-service.js";
import { createContentPersistenceService } from "./persistence-service.js";
import { createContentTimerEffectService } from "./timer-effect-service.js";

export function createContentMachineHostServices({
  ownerWindow = globalThis.window,
  pageObservation,
  logger = null,
  persistence = createContentPersistenceService(),
  clipboardReader = undefined,
  timerEffects = createContentTimerEffectService(),
} = {}) {
  return {
    persistence,
    pasteEffects: createContentPasteEffectService({
      ownerWindow,
      pageObservation,
      logger,
      clipboardReader,
    }),
    timerEffects,
  };
}
