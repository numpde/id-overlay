// Class-b product specimens for reference-image behavior tests. These fixtures
// are intentionally test-local; they name likely application vocabulary without
// forcing production factories before implementation needs them.

export function normalizedReferenceImage() {
  return {
    imageDataRef: "reference-image-data-1",
    intrinsicSizePx: {
      width: 640,
      height: 480,
    },
  };
}

export function awaitingReferenceImagePasteState({ requestId = 1 } = {}) {
  return {
    referenceImageInput: {
      status: "awaiting-paste",
      requestId,
    },
  };
}

export function referenceImageLoadedState() {
  return {
    session: {
      mode: "align",
      referenceImage: normalizedReferenceImage(),
    },
  };
}

export function referenceImageDurableState() {
  return {
    session: referenceImageLoadedState().session,
  };
}

export function acceptedReferenceImagePastePayload({ requestId = 1 } = {}) {
  return {
    requestId,
    outcome: {
      kind: "accepted",
      referenceImage: normalizedReferenceImage(),
    },
  };
}

export function durableStateChangedEffect(durableState) {
  return {
    kind: "durable-state-changed",
    durableState,
  };
}
