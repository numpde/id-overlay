// Shared only for concrete reference-image specimens used across application
// tests. These are not production factories; they keep cross-test product
// vocabulary single-sourced without turning fixtures into architecture.

export function awaitingReferenceImagePasteState() {
  return {
    referenceImageInput: {
      status: "awaiting-paste",
    },
  };
}

export function normalizedReferenceImage() {
  return {
    imageDataRef: "reference-image-data-1",
    intrinsicSizePx: {
      width: 640,
      height: 480,
    },
  };
}

export function referenceImageSessionState() {
  return {
    session: {
      mode: "align",
      referenceImage: normalizedReferenceImage(),
    },
  };
}

export function referenceImageDurableState() {
  return {
    session: referenceImageSessionState().session,
  };
}

export function referenceImageDurableStateChangedEffect() {
  return {
    kind: "durable-state-changed",
    durableState: referenceImageDurableState(),
  };
}
