import { createClipboardImageReader } from "./paste-adapter.js";
import { createPagePlacedPasteReadOutcome } from "./paste-read-outcome.js";

export function createContentPasteEffectService({
  ownerWindow = globalThis.window,
  logger = null,
  clipboardReader = createClipboardImageReader({ ownerWindow, logger }),
  pageObservation,
} = {}) {
  let activeCapture = null;

  return {
    readPasteImage,
    startManualPasteCapture,
    cancelManualPasteCapture,
  };

  async function readPasteImage() {
    return createPasteReadOutcome({
      fact: await clipboardReader.readClipboardApiImage(),
    });
  }

  function startManualPasteCapture({ requestId }) {
    cancelManualPasteCapture({ requestId: null });
    return new Promise((resolve) => {
      activeCapture = { requestId, resolve };
      ownerWindow.addEventListener("paste", handleWindowPaste, true);
    });
  }

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
    finishManualPasteCapture(createPasteReadOutcome({ fact }));
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

  function createPasteReadOutcome({ fact }) {
    return createPagePlacedPasteReadOutcome({
      fact,
      pageObservation,
    });
  }
}
