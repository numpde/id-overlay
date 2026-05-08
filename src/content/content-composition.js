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

const DEFAULT_CONTENT_COMPOSITION_DEPS = Object.freeze({
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

export function createContentComposition({
  ownerWindow = globalThis.window,
  pagePorts,
  keyboardGateway = null,
  logger = null,
  deps = DEFAULT_CONTENT_COMPOSITION_DEPS,
} = {}) {
  return {
    start,
  };

  async function start() {
    const host = createHostNode({ deps });
    destroyActiveSessionNode({ deps, host });
    const machineServices = createMachineServicesNode({
      deps,
      ownerWindow,
      pageObservation: pagePorts.pageObservation,
      logger,
    });
    const machineHost = await createMachineHostNode({
      deps,
      pageObservation: pagePorts.pageObservation,
      machineServices,
    });
    const interactionPorts = createInteractionPortsNode({
      deps,
      machineHost,
      pagePorts,
      keyboardGateway,
    });
    const shadow = await createShadowShellNode({
      deps,
      host,
    });
    const overlayEnvironment = createOverlayEnvironmentNode({
      deps,
      pagePorts,
      machineHost,
      interactionPorts,
    });
    const overlay = createOverlayNode({
      deps,
      overlayEnvironment,
    });
    const panel = createPanelNode({
      deps,
      shadow,
      machineHost,
    });
    return installContentSessionNode({
      deps,
      host,
      ownerWindow,
      machineHost,
      panel,
      overlay,
      interactionPorts,
      pageSession: pagePorts.pageSession,
    });
  }
}

function createHostNode({ deps }) {
  return deps.ensureExtensionHost();
}

function destroyActiveSessionNode({ deps, host }) {
  deps.destroyActiveContentSession(host);
}

function createMachineServicesNode({
  deps,
  ownerWindow,
  pageObservation,
  logger,
}) {
  return deps.createContentMachineHostServices({
    ownerWindow,
    pageObservation,
    logger,
  });
}

async function createMachineHostNode({
  deps,
  pageObservation,
  machineServices,
}) {
  return deps.createContentMachineHost({
    initialPageContext: pageObservation.getSnapshot(),
    services: machineServices,
  });
}

function createInteractionPortsNode({
  deps,
  machineHost,
  pagePorts,
  keyboardGateway,
}) {
  return deps.createInteractionPorts({
    machineHost,
    pageObservation: pagePorts.pageObservation,
    pageProjection: pagePorts.pageProjection,
    mapGesture: pagePorts.mapGesture,
    keyboardGateway,
  });
}

async function createShadowShellNode({ deps, host }) {
  const shadow = host.shadowRoot ?? host.attachShadow({ mode: "open" });
  await deps.attachShadowStyles(shadow);
  deps.clearOwnedShadowNodes(shadow);
  return shadow;
}

function createOverlayEnvironmentNode({
  deps,
  pagePorts,
  machineHost,
  interactionPorts,
}) {
  return deps.createOverlayEnvironment({
    pagePorts,
    machineHost,
    overlayInteractions: interactionPorts.overlayInteractionPort,
  });
}

function createOverlayNode({ deps, overlayEnvironment }) {
  return deps.createOverlay({
    environment: overlayEnvironment,
  });
}

function createPanelNode({ deps, shadow, machineHost }) {
  return deps.createPanel({
    shadow,
    machineHost,
  });
}

function installContentSessionNode({
  deps,
  host,
  ownerWindow,
  machineHost,
  panel,
  overlay,
  interactionPorts,
  pageSession,
}) {
  return deps.installContentSession({
    host,
    ownerWindow,
    machineHost,
    panel,
    overlay,
    interactionPorts,
    pageSession,
  });
}
