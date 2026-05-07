import { createContentMachineHost } from "./content-machine-host.js";
import { createContentMachineHostServices } from "./content-machine-host-services.js";
import { createInteractionPorts } from "./interaction-ports.js";
import { createOverlayEnvironment } from "./overlay-environment.js";
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
  createContentMachineHostServices,
  createInteractionPorts,
  createOverlayEnvironment,
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
  // TODO(smell): App composition order is encoded as imperative setup. It is
  // correct but brittle: final shape should expose a declarative content graph
  // so page ports, machine host, interactions, overlay, and panel dependencies
  // are visible without reading construction order.
  const host = deps.ensureExtensionHost();
  deps.destroyActiveContentSession(host);
  const machineHostServices = deps.createContentMachineHostServices({
    ownerWindow,
    pageObservation: pagePorts.pageObservation,
    logger,
  });
  const machineHost = await deps.createContentMachineHost({
    initialPageContext: pagePorts.pageObservation.getSnapshot(),
    services: machineHostServices,
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

  const overlayEnvironment = deps.createOverlayEnvironment({
    pagePorts,
    machineHost,
    overlayInteractions: interactionPorts.overlayInteractionPort,
  });
  const overlay = deps.createOverlay({
    environment: overlayEnvironment,
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
