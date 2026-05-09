import {
  CLIPBOARD_IMAGE_READ_KIND,
  createClipboardImageFailureFact,
  createClipboardUnavailableFact,
} from "../core/clipboard-facts.js";

export function createClipboardApiImageSource({
  ownerWindow = globalThis.window,
  logger = null,
  imageDecoder,
} = {}) {
  return {
    readClipboardApiImage,
  };

  async function readClipboardApiImage() {
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
}
