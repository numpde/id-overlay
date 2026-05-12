import {
  createBrowserImageNormalizer,
} from "./image-normalization.js";

export function createBrowserReferenceImageInputPort({
  ownerWindow = globalThis.window,
} = {}) {
  return createReferenceImageInputPortAdapter({
    readClipboardImageHandle: () => readClipboardImageHandle({
      clipboard: ownerWindow?.navigator?.clipboard,
    }),
    readPasteEventImageHandle,
    normalizeImageHandle: createBrowserImageNormalizer({
      ownerWindow,
    }),
    addPasteListener(handler) {
      if (!ownerWindow?.addEventListener || !ownerWindow?.removeEventListener) {
        throw new TypeError("Paste listener unavailable.");
      }
      ownerWindow.addEventListener("paste", handler, true);
      return () => ownerWindow.removeEventListener("paste", handler, true);
    },
  });
}

export function createReferenceImageInputPortAdapter({
  readClipboardImageHandle,
  readPasteEventImageHandle,
  normalizeImageHandle,
  addPasteListener,
}) {
  // Own all browser-input mechanics here; the application only sees the final
  // normalized, request-correlated outcome through reportOutcome.
  let activeRequest = null;

  return {
    async startReferenceImageInput({ requestId, reportOutcome }) {
      cancelActiveRequest();
      const request = {
        requestId,
        reportOutcome,
        cleanup: null,
      };
      activeRequest = request;

      const sourceResult = await readSourceResult(readClipboardImageHandle);
      if (!isActiveRequest(request)) {
        return;
      }
      if (sourceResult.kind === "unavailable") {
        await startManualPasteCapture(request);
        return;
      }
      await finishWithSourceResult(request, sourceResult);
    },
    cancelReferenceImageInput({ requestId }) {
      if (activeRequest?.requestId === requestId) {
        cancelActiveRequest();
      }
    },
  };

  async function startManualPasteCapture(request) {
    if (typeof addPasteListener !== "function") {
      await finishWithOutcome(request, {
        kind: "failed",
        reason: "source-unavailable",
      });
      return;
    }

    try {
      request.cleanup = addPasteListener((event) => handlePasteEvent({
        event,
        request,
      }));
    } catch {
      await finishWithOutcome(request, {
        kind: "failed",
        reason: "source-unavailable",
      });
    }
  }

  async function handlePasteEvent({ event, request }) {
    if (!isActiveRequest(request)) {
      return;
    }
    event.preventDefault?.();
    const sourceResult = await readSourceResult(() => readPasteEventImageHandle(event));
    if (!isActiveRequest(request)) {
      return;
    }
    await finishWithSourceResult(request, sourceResult);
  }

  async function finishWithSourceResult(request, sourceResult) {
    await finishWithOutcome(
      request,
      await normalizeReferenceImageSourceResult({
        sourceResult,
        normalizeImageHandle,
      }),
    );
  }

  async function finishWithOutcome(request, outcome) {
    if (!isActiveRequest(request)) {
      return;
    }
    clearActiveRequest(request);
    await request.reportOutcome(outcome);
  }

  function cancelActiveRequest() {
    if (!activeRequest) {
      return;
    }
    clearActiveRequest(activeRequest);
  }

  function clearActiveRequest(request) {
    request.cleanup?.();
    if (activeRequest === request) {
      activeRequest = null;
    }
  }

  function isActiveRequest(request) {
    return activeRequest === request;
  }
}

export async function normalizeReferenceImageSourceResult({
  sourceResult,
  normalizeImageHandle,
}) {
  if (sourceResult?.kind === "empty") {
    return {
      kind: "empty",
    };
  }
  if (sourceResult?.kind === "unsupported") {
    return {
      kind: "failed",
      reason: "unsupported-image",
    };
  }
  if (sourceResult?.kind === "image") {
    return normalizeImageHandle(sourceResult.imageHandle);
  }
  return {
    kind: "failed",
    reason: "source-unavailable",
  };
}

export async function readClipboardImageHandle({
  clipboard = globalThis.navigator?.clipboard,
} = {}) {
  if (typeof clipboard?.read !== "function") {
    return {
      kind: "unavailable",
    };
  }

  try {
    const clipboardItems = await clipboard.read();
    const imageItem = Array.from(clipboardItems ?? [])
      .map((item) => ({
        item,
        imageType: Array.from(item.types ?? []).find(isImageMimeType),
      }))
      .find(({ imageType }) => imageType);
    if (!imageItem) {
      return {
        kind: "empty",
      };
    }
    return imageSourceResultFromBlob({
      blob: await imageItem.item.getType(imageItem.imageType),
      mimeType: imageItem.imageType,
    });
  } catch {
    return {
      kind: "unavailable",
    };
  }
}

export function readPasteEventImageHandle(event) {
  const imageItem = Array.from(event?.clipboardData?.items ?? [])
    .find((item) => isImageMimeType(item.type));
  if (!imageItem) {
    return {
      kind: "empty",
    };
  }
  const blob = imageItem.getAsFile?.();
  if (!blob) {
    return {
      kind: "unavailable",
    };
  }
  return imageSourceResultFromBlob({
    blob,
    mimeType: imageItem.type,
  });
}

function imageSourceResultFromBlob({ blob, mimeType }) {
  return {
    kind: "image",
    imageHandle: {
      runtimeBlob: blob,
      mimeType,
    },
  };
}

async function readSourceResult(readSource) {
  try {
    return await readSource();
  } catch {
    return {
      kind: "unavailable",
    };
  }
}

function isImageMimeType(mimeType) {
  return typeof mimeType === "string" && mimeType.startsWith("image/");
}
