import {
  clearActiveSession,
  destroyExistingSession,
  storeActiveSession,
} from "./host-lifecycle.js";

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
  let destroyed = false;

  function destroy() {
    if (destroyed) {
      return;
    }
    destroyed = true;
    ownerWindow.removeEventListener("beforeunload", handleBeforeUnload);
    machineHost.destroy();
    panel.destroy();
    overlay.destroy();
    interactionPorts.destroy();
    pageSession.destroy();
    clearActiveSession(host, session);
  }

  function handleBeforeUnload() {
    destroy();
  }

  const session = {
    destroy,
    handleBeforeUnload,
  };

  return session;
}
