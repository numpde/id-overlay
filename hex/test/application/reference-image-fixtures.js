// Shared only for concrete application specimens used across tests. These are
// not factory abstractions for production; they prevent drift in the first
// reference-image flow while the implementation is still test-driven.

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
