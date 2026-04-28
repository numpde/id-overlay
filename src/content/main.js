import { createStateStore } from "../core/state.js";
import { createExtensionStorage } from "../core/storage.js";
import { createInteractionController } from "../core/interactions.js";
import { createPageAdapter } from "./page-adapter.js";
import { createStatusController } from "./status-controller.js";
import { createPanel } from "./panel.js";
import { createOverlay } from "./overlay.js";
import { BUILD_INFO } from "../core/build-info.js";
import { createLogger } from "../core/logger.js";

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
  const store = createStateStore(persistedState ?? {});
  const interactions = createInteractionController({
    store,
    pageAdapter,
    keyboardGateway,
  });
  const status = createStatusController({
    store,
    interactions,
  });
  const shadow = host.shadowRoot ?? host.attachShadow({ mode: "open" });
  await attachShadowStyles(shadow);
  clearOwnedShadowNodes(shadow);

  const overlay = createOverlay({
    shadow,
    pageAdapter,
    store,
    interactions,
    statusController: status,
  });

  const panel = createPanel({
    shadow,
    store,
    interactions,
    statusController: status,
  });

  const unsubscribe = store.subscribe((state) => {
    storage.save(state).catch((error) => {
      console.error("id-overlay: failed to persist state", error);
    });
  }, { emitCurrent: false });

  const session = createSession({
    host,
    unsubscribeStore: unsubscribe,
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
  unsubscribeStore,
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
    unsubscribeStore();
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
