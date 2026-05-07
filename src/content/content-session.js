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
  // TODO(smell): Session lifetime owns browser beforeunload, host storage, and
  // five component destroy calls. The final content session should be a small
  // disposer registry so adding a component cannot forget teardown ordering.
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
    // TODO(smell): Teardown order is currently hand-authored. Keep it explicit
    // until component dependencies are represented by a disposer stack.
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
