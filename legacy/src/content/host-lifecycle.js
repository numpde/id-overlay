const HOST_ID = "id-overlay-root";
const OWNED_NODE_SELECTOR = "[data-id-overlay-owned='true']";
const SESSION_KEY = "__idOverlaySession__";

export function ensureExtensionHost({ document = globalThis.document } = {}) {
  let host = document.getElementById(HOST_ID);
  if (host) {
    return host;
  }
  host = document.createElement("div");
  host.id = HOST_ID;
  document.documentElement.append(host);
  return host;
}

export function destroyExistingSession(host) {
  const session = host[SESSION_KEY];
  session?.destroy();
  clearActiveSession(host, session);
}

export function storeActiveSession(host, session) {
  host[SESSION_KEY] = session;
}

export function clearActiveSession(host, session) {
  if (host[SESSION_KEY] === session) {
    delete host[SESSION_KEY];
  }
}

export function clearOwnedShadowNodes(shadow) {
  for (const node of shadow.querySelectorAll(OWNED_NODE_SELECTOR)) {
    node.remove();
  }
}
