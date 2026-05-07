import { createExtensionStorage } from "../platform/storage.js";
import { createInteractionPorts } from "./interaction-ports.js";
import { createMachineHost } from "../core/machine/host.js";
import { createPageAdapter } from "./page-adapter.js";
import { createPanel } from "./panel.js";
import { createOverlay } from "./overlay.js";
import { createClipboardImageReader } from "./paste-adapter.js";
import { createPagePlacedPasteReadOutcome } from "./paste-read-outcome.js";
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
import { DEFAULT_STORAGE_KEY } from "../platform/storage-key.js";

export async function bootstrapIdOverlay({ keyboardGateway = null } = {}) {
  // TODO(smell): Bootstrap still owns machine/paste composition and lifecycle
  // teardown. Extract those before adding more branches here.
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
  return createPagePlacedPasteReadOutcome({
    fact,
    pageObservation,
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
