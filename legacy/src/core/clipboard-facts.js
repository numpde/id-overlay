export const CLIPBOARD_IMAGE_READ_KIND = Object.freeze({
  UNAVAILABLE: "unavailable",
  DECODED_IMAGE: "decoded-image",
  MISSING_IMAGE: "missing-image",
  UNREADABLE_IMAGE: "unreadable-image",
});

export function createClipboardUnavailableFact() {
  return {
    kind: CLIPBOARD_IMAGE_READ_KIND.UNAVAILABLE,
  };
}

export function createDecodedClipboardImageFact({ image }) {
  return {
    kind: CLIPBOARD_IMAGE_READ_KIND.DECODED_IMAGE,
    image,
  };
}

export function createClipboardImageFailureFact({ kind }) {
  return {
    kind,
  };
}
