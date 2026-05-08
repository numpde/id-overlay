import {
  clearActiveSession,
  destroyExistingSession,
  storeActiveSession,
} from "./host-lifecycle.js";
import { createDisposerSequence } from "./disposer-sequence.js";

export function destroyActiveContentSession(host) {
  destroyExistingSession(host);
}

export function installContentSession({
  host,
  ownerWindow = globalThis.window,
  machineHost,
  panel,
  overlay,
  interactionPorts,
  pageSession,
}) {
  destroyActiveContentSession(host);
  const session = createContentSession({
    host,
    ownerWindow,
    machineHost,
    panel,
    overlay,
    interactionPorts,
    pageSession,
  });
  storeActiveSession(host, session);
  ownerWindow.addEventListener("beforeunload", session.handleBeforeUnload);
  return session;
}

function createContentSession({
  host,
  ownerWindow,
  machineHost,
  panel,
  overlay,
  interactionPorts,
  pageSession,
}) {
  function handleBeforeUnload() {
    session.destroy();
  }

  const disposerSequence = createDisposerSequence([
    () => ownerWindow.removeEventListener("beforeunload", handleBeforeUnload),
    () => machineHost.destroy(),
    () => panel.destroy(),
    () => overlay.destroy(),
    () => interactionPorts.destroy(),
    () => pageSession.destroy(),
    () => clearActiveSession(host, session),
  ]);
  const session = {
    destroy: disposerSequence.destroy,
    handleBeforeUnload,
  };

  return session;
}
