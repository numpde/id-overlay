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
