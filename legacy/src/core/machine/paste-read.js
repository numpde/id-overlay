import {
  CLIPBOARD_IMAGE_READ_KIND,
} from "../clipboard-facts.js";

export const MACHINE_PASTE_SOURCE = Object.freeze({
  CLIPBOARD_API: "clipboard-api",
  MANUAL_PASTE: "manual-paste",
});

export const MACHINE_PASTE_READ_OUTCOME_KIND = Object.freeze({
  DECODED_IMAGE: "decoded-image",
  CLIPBOARD_FAILURE: "clipboard-failure",
});

const KNOWN_PASTE_SOURCES = new Set(Object.values(MACHINE_PASTE_SOURCE));

export function normalizeMachinePasteSource(source) {
  return KNOWN_PASTE_SOURCES.has(source) ? source : null;
}

export function createPasteReadOutcomeFromClipboardFact({ fact, placement = null }) {
  if (!fact || fact.kind === CLIPBOARD_IMAGE_READ_KIND.UNAVAILABLE) {
    return null;
  }
  if (fact.kind === CLIPBOARD_IMAGE_READ_KIND.DECODED_IMAGE) {
    return createDecodedImagePasteReadOutcome({
      image: fact.image,
      placement,
    });
  }
  if (
    fact.kind === CLIPBOARD_IMAGE_READ_KIND.MISSING_IMAGE ||
    fact.kind === CLIPBOARD_IMAGE_READ_KIND.UNREADABLE_IMAGE
  ) {
    return createClipboardFailurePasteReadOutcome({
      failureKind: fact.kind,
    });
  }
  return null;
}

export function createDecodedImagePasteReadOutcome({ image, placement = null }) {
  if (!image) {
    return null;
  }
  return {
    kind: MACHINE_PASTE_READ_OUTCOME_KIND.DECODED_IMAGE,
    image,
    placement,
  };
}

export function createClipboardFailurePasteReadOutcome({ failureKind }) {
  if (
    failureKind !== CLIPBOARD_IMAGE_READ_KIND.MISSING_IMAGE &&
    failureKind !== CLIPBOARD_IMAGE_READ_KIND.UNREADABLE_IMAGE
  ) {
    return null;
  }
  return {
    kind: MACHINE_PASTE_READ_OUTCOME_KIND.CLIPBOARD_FAILURE,
    failureKind,
  };
}
