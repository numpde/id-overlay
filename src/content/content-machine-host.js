import { createExtensionStorage } from "../platform/storage.js";
import { DEFAULT_STORAGE_KEY } from "../platform/storage-key.js";
import { createMachineHost } from "../core/machine/host.js";
import { createContentPasteEffectService } from "./paste-effect-service.js";
import { createContentTimerEffectService } from "./timer-effect-service.js";

export async function createContentMachineHost({
  ownerWindow = globalThis.window,
  pageObservation,
  logger = null,
  storage = createExtensionStorage({ storageKey: DEFAULT_STORAGE_KEY }),
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
  const persistedSession = await storage.load();
  const machineHost = createMachineHost({
    persistedSession,
    savePersistedSession: (session) => storage.save(session),
    ...pasteEffects,
    ...timerEffects,
    onError,
  });
  machineHost.ingestPageContext(pageObservation.getSnapshot());
  return machineHost;
}
