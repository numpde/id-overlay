import {
  CLIPBOARD_IMAGE_READ_KIND,
  createClipboardImageFailureFact,
  createClipboardUnavailableFact,
} from "../core/clipboard-facts.js";
import { createClipboardImageDecoder } from "./clipboard-image-decoder.js";

export function createClipboardImageReader({
  ownerWindow = globalThis.window,
  logger = null,
  imageDecoder = createClipboardImageDecoder({ ownerWindow, logger }),
} = {}) {
  async function readClipboardApiImage() {
    // TODO(smell): Clipboard API availability and permission fallback are still
    // bundled with Clipboard API item extraction. Split capability probing from
    // source reads if more clipboard sources are added.
    if (typeof ownerWindow.navigator?.clipboard?.read !== "function") {
      return createClipboardUnavailableFact();
    }

    try {
      const clipboardItems = await ownerWindow.navigator.clipboard.read();
      const imageType = clipboardItems
        .flatMap((item) => item.types)
        .find((type) => type.startsWith("image/"));

      if (!imageType) {
        logger?.warn?.("Clipboard API read succeeded but no image type was present");
        return createClipboardImageFailureFact({
          kind: CLIPBOARD_IMAGE_READ_KIND.MISSING_IMAGE,
        });
      }

      const clipboardItem = clipboardItems.find((item) => item.types.includes(imageType));
      return imageDecoder.decodeImageBlob(await clipboardItem.getType(imageType), {
        sourceLabel: "Clipboard API",
      });
    } catch (error) {
      logger?.warn?.("Clipboard API read failed; falling back to manual paste", {
        message: error?.message ?? String(error),
      });
      return createClipboardUnavailableFact();
    }
  }

  async function readClipboardDataImage(clipboardData) {
    // TODO(smell): Paste-event item extraction is a distinct source adapter from
    // Clipboard API reads. Keep this isolated to clipboardData-to-Blob selection.
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

  return {
    readClipboardApiImage,
    readClipboardDataImage,
  };
}
