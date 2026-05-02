import { createExtensionStorage } from "../core/storage.js";
import { createInteractionController } from "../core/interactions.js";
import { createMachineHost } from "../core/machine/host.js";
import { createMachineBackedStateStore } from "../core/machine-store-adapter.js";
import { createPageAdapter } from "./page-adapter.js";
import { createStatusController } from "./status-controller.js";
import { createPanel } from "./panel.js";
import { createOverlay } from "./overlay.js";
import { BUILD_INFO } from "../core/build-info.js";
import { createLogger } from "../core/logger.js";
import { createPlacementTransform } from "../core/transform.js";

const HOST_ID = "id-overlay-root";
const OWNED_NODE_SELECTOR = "[data-id-overlay-owned='true']";
const SESSION_KEY = "__idOverlaySession__";

export async function bootstrapIdOverlay({ keyboardGateway = null } = {}) {
  const logger = createLogger("main");
  const pageAdapter = createPageAdapter();
  if (!pageAdapter.isSupported()) {
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

  const host = ensureHost();
  destroyExistingSession(host);
  const storage = createExtensionStorage();
  const persistedState = await storage.load();
  const machineHost = createMachineHost({
    persistedSession: migratePersistedStateForCurrentMap(persistedState, pageAdapter.getSnapshot()),
    savePersistedSession: (session) => storage.save(session),
    setPanelTimeout: (callback, { delayMs }) => globalThis.setTimeout(callback, delayMs),
    clearPanelTimeout: (handle) => globalThis.clearTimeout(handle),
  });
  const store = createMachineBackedStateStore(machineHost);
  const interactions = createInteractionController({
    store,
    pageAdapter,
    keyboardGateway,
  });
  const status = createStatusController({
    machineHost,
    interactions,
  });
  const shadow = host.shadowRoot ?? host.attachShadow({ mode: "open" });
  await attachShadowStyles(shadow);
  clearOwnedShadowNodes(shadow);

  const overlay = createOverlay({
    pageAdapter,
    store,
    interactions,
  });

  const panel = createPanel({
    shadow,
    interactions,
    statusController: status,
    machineHost,
  });

  const session = createSession({
    host,
    machineHost,
    panel,
    overlay,
    status,
    interactions,
    pageAdapter,
  });
  host[SESSION_KEY] = session;
  window.addEventListener("beforeunload", session.handleBeforeUnload);

  logger.info("Bootstrap complete");
}

function migratePersistedStateForCurrentMap(persistedState, snapshot) {
  // Final semantic-history shape: persisted-state migrations should produce
  // canonical durable session data before store creation. They should not need
  // to understand UI history records or transition internals.
  if (!persistedState?.image) {
    return persistedState ?? {};
  }

  const placement = persistedState.placement;
  if (placement?.type === "similarity") {
    return persistedState;
  }

  if (
    placement?.centerMapLatLon &&
    Number.isFinite(placement?.scale) &&
    Number.isFinite(placement?.rotationRad)
  ) {
    return {
      ...persistedState,
      placement: createPlacementTransform({
        image: persistedState.image,
        centerMapLatLon: placement.centerMapLatLon,
        scale: placement.scale,
        rotationRad: placement.rotationRad,
        zoom: snapshot.mapView.zoom,
      }),
    };
  }

  return persistedState;
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

function ensureHost() {
  let host = document.getElementById(HOST_ID);
  if (host) {
    return host;
  }
  host = document.createElement("div");
  host.id = HOST_ID;
  document.documentElement.append(host);
  return host;
}

function destroyExistingSession(host) {
  host[SESSION_KEY]?.destroy();
}

async function attachShadowStyles(shadow) {
  if (shadow.querySelector('link[data-id-overlay-styles="true"]')) {
    return;
  }
  const runtime = globalThis.chrome?.runtime ?? globalThis.browser?.runtime;
  const stylesheetUrl = runtime.getURL("src/content/content.css");
  const link = document.createElement("link");
  link.dataset.idOverlayStyles = "true";
  link.rel = "stylesheet";
  link.href = stylesheetUrl;
  shadow.append(link);
  await new Promise((resolve) => {
    link.addEventListener("load", resolve, { once: true });
    link.addEventListener("error", resolve, { once: true });
  });
}

function clearOwnedShadowNodes(shadow) {
  for (const node of shadow.querySelectorAll(OWNED_NODE_SELECTOR)) {
    node.remove();
  }
}

function createSession({
  host,
  machineHost,
  panel,
  overlay,
  status,
  interactions,
  pageAdapter,
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
    status.destroy();
    interactions.destroy();
    pageAdapter.destroy();
    if (host[SESSION_KEY] === session) {
      delete host[SESSION_KEY];
    }
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
