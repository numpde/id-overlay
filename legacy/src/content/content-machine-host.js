import { createMachineHost } from "../core/machine/host.js";

export async function createContentMachineHost({
  initialPageContext,
  services,
  onError = null,
} = {}) {
  const { persistence, pasteEffects, timerEffects } = services;
  const persistedSession = await persistence.loadPersistedSession();
  const machineHost = createMachineHost({
    persistedSession,
    savePersistedSession: persistence.savePersistedSession,
    ...pasteEffects,
    ...timerEffects,
    onError,
  });
  machineHost.ingestPageContext(initialPageContext);
  return machineHost;
}
