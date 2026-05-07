import { createExtensionStorage } from "../platform/storage.js";
import { DEFAULT_STORAGE_KEY } from "../platform/storage-key.js";
import { createMachineHost } from "../core/machine/host.js";
import { createClipboardImageReader } from "./paste-adapter.js";
import { createPagePlacedPasteReadOutcome } from "./paste-read-outcome.js";

export async function createContentMachineHost({
  ownerWindow = globalThis.window,
  pageObservation,
  logger = null,
  storage = createExtensionStorage({ storageKey: DEFAULT_STORAGE_KEY }),
  clipboardReader = createClipboardImageReader({ ownerWindow, logger }),
  timers = globalThis,
  onError = null,
} = {}) {
  // TODO(smell): This composition root still wires persistence, paste sources,
  // timers, page-context ingestion, and machine host construction inline. The
  // final shape should inject named host services instead of assembling service
  // lambdas here.
  const persistedSession = await storage.load();
  const machineHost = createMachineHost({
    persistedSession,
    savePersistedSession: (session) => storage.save(session),
    readPasteImage: () => readClipboardApiPasteOutcome({
      clipboardReader,
      pageObservation,
    }),
    ...createManualPasteCapture({
      ownerWindow,
      clipboardReader,
      pageObservation,
      logger,
    }),
    setPanelTimeout: (callback, { delayMs }) => timers.setTimeout(callback, delayMs),
    clearPanelTimeout: (handle) => timers.clearTimeout(handle),
    setStatusTimeout: (callback, { delayMs }) => timers.setTimeout(callback, delayMs),
    clearStatusTimeout: (handle) => timers.clearTimeout(handle),
    onError,
  });
  machineHost.ingestPageContext(pageObservation.getSnapshot());
  return machineHost;
}

function createManualPasteCapture({ ownerWindow, clipboardReader, pageObservation, logger }) {
  // TODO(smell): Manual paste capture is an effect service with window listener
  // lifecycle and request staleness policy. Split it into its own content
  // service before changing paste UX again.
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
    // TODO(smell): This handler both owns DOM event capture and converts the
    // clipboard fact into a page-placed machine outcome. Final shape should keep
    // DOM capture and outcome placement as separate service boundaries.
    const requestId = activeCapture?.requestId ?? null;
    if (requestId === null) {
      return;
    }

    event.preventDefault();
    const fact = await clipboardReader.readClipboardDataImage(event.clipboardData);
    if (activeCapture?.requestId !== requestId) {
      logger?.info?.("Ignoring window paste result because paste capture was cancelled");
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
  // TODO(smell): Clipboard API paste and manual paste share outcome placement,
  // but that coupling is hidden in this small helper. Prefer one paste effect
  // service that composes source readers with the placement adapter explicitly.
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
