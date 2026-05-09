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
