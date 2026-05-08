import {
  CLIPBOARD_IMAGE_READ_KIND,
  createClipboardImageFailureFact,
} from "../core/clipboard-facts.js";

export function createPasteEventImageSource({
  logger = null,
  imageDecoder,
} = {}) {
  return {
    readClipboardDataImage,
  };

  async function readClipboardDataImage(clipboardData) {
    const item = [...(clipboardData?.items ?? [])].find((candidate) =>
      candidate.type.startsWith("image/"),
    );
    if (!item) {
      logger?.warn?.("Window paste event did not contain an image");
      return createClipboardImageFailureFact({
        kind: CLIPBOARD_IMAGE_READ_KIND.MISSING_IMAGE,
      });
    }

    const file = item.getAsFile();
    if (!file) {
      logger?.warn?.("Window paste event image could not be converted to a file");
      return createClipboardImageFailureFact({
        kind: CLIPBOARD_IMAGE_READ_KIND.UNREADABLE_IMAGE,
      });
    }

    return imageDecoder.decodeImageBlob(file, {
      sourceLabel: "window paste event",
    });
  }
}
