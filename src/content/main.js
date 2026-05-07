import { createContentMachineHost } from "./content-machine-host.js";
import { createInteractionPorts } from "./interaction-ports.js";
import { createPageAdapter } from "./page-adapter.js";
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
import { BUILD_INFO } from "../core/build-info.js";
import { createLogger } from "../core/logger.js";

export async function bootstrapIdOverlay({ keyboardGateway = null } = {}) {
  // TODO(smell): Bootstrap still owns app composition. Extract a single
  // content app factory before adding more branches here.
  const logger = createLogger("main");
  const pagePorts = createPageAdapter();
  if (!pagePorts.pageSession.isSupported()) {
    logger.debug("Skipping unsupported page", {
      href: globalThis.location?.href ?? null,
      build: BUILD_INFO,
    });
    return;
  }
  logger.info("Bootstrapping extension", {
    href: globalThis.location?.href ?? null,
    build: BUILD_INFO,
  });

  const host = ensureExtensionHost();
  destroyActiveContentSession(host);
  const machineHost = await createContentMachineHost({
    ownerWindow: window,
    pageObservation: pagePorts.pageObservation,
    logger,
  });
  const interactionPorts = createInteractionPorts({
    machineHost,
    pageObservation: pagePorts.pageObservation,
    pageProjection: pagePorts.pageProjection,
    mapGesture: pagePorts.mapGesture,
    keyboardGateway,
  });
  const shadow = host.shadowRoot ?? host.attachShadow({ mode: "open" });
  await attachShadowStyles(shadow);
  clearOwnedShadowNodes(shadow);

  const overlay = createOverlay({
    pageObservation: pagePorts.pageObservation,
    pageProjection: pagePorts.pageProjection,
    isForwardedMapGestureEvent: pagePorts.mapGesture.isForwardedMapGestureEvent,
    machineHost,
    overlayInteractions: interactionPorts.overlayInteractionPort,
  });

  const panel = createPanel({
    shadow,
    machineHost,
  });

  installContentSession({
    host,
    ownerWindow: window,
    machineHost,
    panel,
    overlay,
    interactionPorts,
    pageSession: pagePorts.pageSession,
  });

  logger.info("Bootstrap complete");
}

export function queueBootstrapIdOverlay({ keyboardGateway = null } = {}) {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      bootstrapIdOverlay({ keyboardGateway });
    }, { once: true });
    return;
  }
  bootstrapIdOverlay({ keyboardGateway });
}
