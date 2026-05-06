import { createExtensionStorage } from "../platform/storage.js";
import { createInteractionController } from "./interaction-controller.js";
import { createMachineHost } from "../core/machine/host.js";
import { createPageAdapter } from "./page-adapter.js";
import { createPanel } from "./panel.js";
import { createOverlay } from "./overlay.js";
import { createClipboardImageReader } from "./paste-adapter.js";
import { createClipboardFactPasteReadOutcome } from "../core/machine/effects.js";
import { BUILD_INFO } from "../core/build-info.js";
import { createLogger } from "../core/logger.js";
import { DEFAULT_STORAGE_KEY } from "../platform/storage-key.js";

const HOST_ID = "id-overlay-root";
const OWNED_NODE_SELECTOR = "[data-id-overlay-owned='true']";
const SESSION_KEY = "__idOverlaySession__";

export async function bootstrapIdOverlay({ keyboardGateway = null } = {}) {
  // TODO(smell): Bootstrap still owns composition plus page cleanup, shadow
  // stylesheet injection, paste capture, and lifecycle teardown. Extract host,
  // style, and session-lifecycle helpers before adding more branches here.
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

  const host = ensureHost();
  destroyExistingSession(host);
  const storage = createExtensionStorage({ storageKey: DEFAULT_STORAGE_KEY });
  const persistedState = await storage.load();
  const clipboardReader = createClipboardImageReader({
    ownerWindow: window,
    logger,
  });
  const machineHost = createMachineHost({
    persistedSession: persistedState,
    savePersistedSession: (session) => storage.save(session),
    readPasteImage: () => readClipboardApiPasteOutcome({
      clipboardReader,
      pageObservation: pagePorts.pageObservation,
    }),
    ...createManualPasteCapture({
      ownerWindow: window,
      clipboardReader,
      pageObservation: pagePorts.pageObservation,
      logger,
    }),
    setPanelTimeout: (callback, { delayMs }) => globalThis.setTimeout(callback, delayMs),
    clearPanelTimeout: (handle) => globalThis.clearTimeout(handle),
    setStatusTimeout: (callback, { delayMs }) => globalThis.setTimeout(callback, delayMs),
    clearStatusTimeout: (handle) => globalThis.clearTimeout(handle),
  });
  machineHost.ingestPageContext(pagePorts.pageObservation.getSnapshot());
  const interactions = createInteractionController({
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
    pageSession: pagePorts.pageSession,
  });
  host[SESSION_KEY] = session;
  window.addEventListener("beforeunload", session.handleBeforeUnload);

  logger.info("Bootstrap complete");
}

function createManualPasteCapture({ ownerWindow, clipboardReader, pageObservation, logger }) {
  let activeCapture = null;

  return {
    startManualPasteCapture({ requestId }) {
      cancelManualPasteCapture({ requestId: null });
      return new Promise((resolve) => {
        activeCapture = { requestId, resolve };
        ownerWindow.addEventListener("paste", handleWindowPaste, true);
      });
    },
    cancelManualPasteCapture,
  };

  function cancelManualPasteCapture({ requestId }) {
    if (!activeCapture) {
      return;
    }
    if (requestId !== null && requestId !== activeCapture.requestId) {
      return;
    }
    finishManualPasteCapture(null);
  }

  async function handleWindowPaste(event) {
    const requestId = activeCapture?.requestId ?? null;
    if (requestId === null) {
      return;
    }

    event.preventDefault();
    const fact = await clipboardReader.readClipboardDataImage(event.clipboardData);
    if (activeCapture?.requestId !== requestId) {
      logger.info("Ignoring window paste result because paste capture was cancelled");
      return;
    }
    finishManualPasteCapture(createPasteReadOutcome({
      fact,
      pageObservation,
    }));
  }

  function finishManualPasteCapture(outcome) {
    if (!activeCapture) {
      return;
    }
    const { resolve } = activeCapture;
    ownerWindow.removeEventListener("paste", handleWindowPaste, true);
    activeCapture = null;
    resolve(outcome);
  }
}

async function readClipboardApiPasteOutcome({ clipboardReader, pageObservation }) {
  return createPasteReadOutcome({
    fact: await clipboardReader.readClipboardApiImage(),
    pageObservation,
  });
}

function createPasteReadOutcome({ fact, pageObservation }) {
  return createClipboardFactPasteReadOutcome({
    fact,
    snapshot: pageObservation.getSnapshot(),
  });
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
    interactions.destroy();
    pageSession.destroy();
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
