import { createExtensionStorage } from "../platform/storage.js";
import { createInteractionController } from "./interaction-controller.js";
import { createMachineHost } from "../core/machine/host.js";
import { migratePersistedMachineSessionForMap } from "../core/machine/persistence.js";
import { createPageAdapter } from "./page-adapter.js";
import { createPanel } from "./panel.js";
import { createOverlay } from "./overlay.js";
import { createClipboardImageReader } from "./paste-adapter.js";
import { BUILD_INFO } from "../core/build-info.js";
import { createLogger } from "../core/logger.js";

const HOST_ID = "id-overlay-root";
const OWNED_NODE_SELECTOR = "[data-id-overlay-owned='true']";
const SESSION_KEY = "__idOverlaySession__";
const STORAGE_KEY = "id-overlay/state";

export async function bootstrapIdOverlay({ keyboardGateway = null } = {}) {
  // TODO(smell): Bootstrap still owns composition plus page cleanup, shadow
  // stylesheet injection, paste capture, and lifecycle teardown. Extract host,
  // style, and session-lifecycle helpers before adding more branches here.
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
  const storage = createExtensionStorage({ storageKey: STORAGE_KEY });
  const persistedState = await storage.load();
  const clipboardReader = createClipboardImageReader({
    ownerWindow: window,
    pageAdapter,
    logger,
  });
  const machineHost = createMachineHost({
    persistedSession: migratePersistedMachineSessionForMap(persistedState, pageAdapter.getSnapshot()),
    savePersistedSession: (session) => storage.save(session),
    readPasteImage: () => clipboardReader.readClipboardApiImage(),
    ...createManualPasteCapture({
      ownerWindow: window,
      clipboardReader,
      logger,
    }),
    setPanelTimeout: (callback, { delayMs }) => globalThis.setTimeout(callback, delayMs),
    clearPanelTimeout: (handle) => globalThis.clearTimeout(handle),
    setStatusTimeout: (callback, { delayMs }) => globalThis.setTimeout(callback, delayMs),
    clearStatusTimeout: (handle) => globalThis.clearTimeout(handle),
  });
  const interactions = createInteractionController({
    machineHost,
    pageAdapter,
    keyboardGateway,
  });
  const shadow = host.shadowRoot ?? host.attachShadow({ mode: "open" });
  await attachShadowStyles(shadow);
  clearOwnedShadowNodes(shadow);

  const overlay = createOverlay({
    pageAdapter,
    machineHost,
    interactions,
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
    interactions,
    pageAdapter,
  });
  host[SESSION_KEY] = session;
  window.addEventListener("beforeunload", session.handleBeforeUnload);

  logger.info("Bootstrap complete");
}

function createManualPasteCapture({ ownerWindow, clipboardReader, logger }) {
  let activeRequestId = null;
  let activeOutcomeHandler = null;

  return {
    startManualPasteCapture({ requestId, onPasteOutcome }) {
      cancelManualPasteCapture({ requestId: null });
      activeRequestId = requestId;
      activeOutcomeHandler = onPasteOutcome;
      ownerWindow.addEventListener("paste", handleWindowPaste, true);
    },
    cancelManualPasteCapture,
  };

  function cancelManualPasteCapture({ requestId }) {
    if (activeRequestId === null) {
      return;
    }
    if (requestId !== null && requestId !== activeRequestId) {
      return;
    }
    ownerWindow.removeEventListener("paste", handleWindowPaste, true);
    activeRequestId = null;
    activeOutcomeHandler = null;
  }

  async function handleWindowPaste(event) {
    const requestId = activeRequestId;
    const outcomeHandler = activeOutcomeHandler;
    if (requestId === null || !outcomeHandler) {
      return;
    }

    event.preventDefault();
    const outcome = await clipboardReader.readClipboardDataImage(event.clipboardData);
    if (activeRequestId !== requestId) {
      logger.info("Ignoring window paste result because paste capture was cancelled");
      return;
    }
    outcomeHandler(outcome);
  }
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
