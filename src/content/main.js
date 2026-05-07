import { createContentMachineHost } from "./content-machine-host.js";
import { createInteractionPorts } from "./interaction-ports.js";
import { createPageAdapter } from "./page-adapter.js";
import { createPanel } from "./panel.js";
import { createOverlay } from "./overlay.js";
import {
  clearActiveSession,
  clearOwnedShadowNodes,
  destroyExistingSession,
  ensureExtensionHost,
  storeActiveSession,
} from "./host-lifecycle.js";
import { attachShadowStyles } from "./shadow-styles.js";
import { BUILD_INFO } from "../core/build-info.js";
import { createLogger } from "../core/logger.js";

export async function bootstrapIdOverlay({ keyboardGateway = null } = {}) {
  // TODO(smell): Bootstrap still owns lifecycle teardown. Extract session
  // composition before adding more branches here.
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
  destroyExistingSession(host);
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

  const session = createSession({
    host,
    machineHost,
    panel,
    overlay,
    interactionPorts,
    pageSession: pagePorts.pageSession,
  });
  storeActiveSession(host, session);
  window.addEventListener("beforeunload", session.handleBeforeUnload);

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

function createSession({
  host,
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
    window.removeEventListener("beforeunload", handleBeforeUnload);
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
