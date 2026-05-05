import {
  CLIPBOARD_IMAGE_READ_KIND,
  createClipboardImageFailureFact,
  createClipboardUnavailableFact,
  createDecodedClipboardImageFact,
} from "../core/clipboard-facts.js";
import { normalizeOverlayImageBlob } from "../core/image-normalization.js";
import { MAX_WORKING_IMAGE_DIMENSION } from "../core/image-policy.js";
import { createBrowserImageNormalizationDeps } from "../platform/browser-image-normalization.js";

export function createClipboardImageReader({
  ownerWindow = globalThis.window,
  logger = null,
} = {}) {
  const imageNormalizationDeps = createBrowserImageNormalizationDeps({
    ownerWindow,
    maxWorkingDimension: MAX_WORKING_IMAGE_DIMENSION,
  });

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
      return readImageBlob(await clipboardItem.getType(imageType), "Clipboard API");
    } catch (error) {
      logger?.warn?.("Clipboard API read failed; falling back to manual paste", {
        message: error?.message ?? String(error),
      });
      return createClipboardUnavailableFact();
    }
  }

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

    return readImageBlob(file, "window paste event");
  }

  async function readImageBlob(blob, sourceLabel) {
    try {
      const image = await normalizeOverlayImageBlob(blob, imageNormalizationDeps);
      if (!image) {
        return createClipboardImageFailureFact({
          kind: CLIPBOARD_IMAGE_READ_KIND.UNREADABLE_IMAGE,
        });
      }
      logger?.info?.("Loaded clipboard image", {
        source: sourceLabel,
      });
      return createDecodedClipboardImageFact({ image });
    } catch (error) {
      logger?.warn?.("Clipboard image could not be read", {
        source: sourceLabel,
        message: error?.message ?? String(error),
      });
      return createClipboardImageFailureFact({
        kind: CLIPBOARD_IMAGE_READ_KIND.UNREADABLE_IMAGE,
      });
    }
  }

  return {
    readClipboardApiImage,
    readClipboardDataImage,
  };
}
