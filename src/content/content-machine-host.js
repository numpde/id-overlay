import { createMachineHost } from "../core/machine/host.js";
import { createContentPasteEffectService } from "./paste-effect-service.js";
import { createContentPersistenceService } from "./persistence-service.js";
import { createContentTimerEffectService } from "./timer-effect-service.js";

export async function createContentMachineHost({
  ownerWindow = globalThis.window,
  pageObservation,
  logger = null,
  persistence = createContentPersistenceService(),
  pasteEffects = createContentPasteEffectService({
    ownerWindow,
    pageObservation,
    logger,
  }),
  timerEffects = createContentTimerEffectService(),
  onError = null,
} = {}) {
  // TODO(smell): This composition root still wires persistence, effect-service
  // construction, page-context ingestion, and machine host construction inline.
  // The final shape should inject named host services instead of assembling
  // service lambdas here.
  const persistedSession = await persistence.loadPersistedSession();
  const machineHost = createMachineHost({
    persistedSession,
    savePersistedSession: persistence.savePersistedSession,
    ...pasteEffects,
    ...timerEffects,
    onError,
  });
  machineHost.ingestPageContext(pageObservation.getSnapshot());
  return machineHost;
}
