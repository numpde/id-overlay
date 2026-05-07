import { createContentMachineHost } from "./content-machine-host.js";
import { createInteractionPorts } from "./interaction-ports.js";
import { createPanel } from "./panel.js";
import { createOverlay } from "./overlay.js";
import {
  clearOwnedShadowNodes,
  ensureExtensionHost,
} from "./host-lifecycle.js";
import {
  destroyActiveContentSession,
  installContentSession,
} from "./content-session.js";
import { attachShadowStyles } from "./shadow-styles.js";

const DEFAULT_APP_DEPS = Object.freeze({
  attachShadowStyles,
  clearOwnedShadowNodes,
  createContentMachineHost,
  createInteractionPorts,
  createOverlay,
  createPanel,
  destroyActiveContentSession,
  ensureExtensionHost,
  installContentSession,
});

export async function createContentApp({
  ownerWindow = globalThis.window,
  pagePorts,
  keyboardGateway = null,
  logger = null,
  deps = DEFAULT_APP_DEPS,
} = {}) {
  const host = deps.ensureExtensionHost();
  deps.destroyActiveContentSession(host);
  const machineHost = await deps.createContentMachineHost({
    ownerWindow,
    pageObservation: pagePorts.pageObservation,
    logger,
  });
  const interactionPorts = deps.createInteractionPorts({
    machineHost,
    pageObservation: pagePorts.pageObservation,
    pageProjection: pagePorts.pageProjection,
    mapGesture: pagePorts.mapGesture,
    keyboardGateway,
  });
  const shadow = host.shadowRoot ?? host.attachShadow({ mode: "open" });
  await deps.attachShadowStyles(shadow);
  deps.clearOwnedShadowNodes(shadow);

  const overlay = deps.createOverlay({
    pageObservation: pagePorts.pageObservation,
    pageProjection: pagePorts.pageProjection,
    isForwardedMapGestureEvent: pagePorts.mapGesture.isForwardedMapGestureEvent,
    machineHost,
    overlayInteractions: interactionPorts.overlayInteractionPort,
  });

  const panel = deps.createPanel({
    shadow,
    machineHost,
  });

  return deps.installContentSession({
    host,
    ownerWindow,
    machineHost,
    panel,
    overlay,
    interactionPorts,
    pageSession: pagePorts.pageSession,
  });
}
