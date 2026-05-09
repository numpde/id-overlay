import {
  CLIPBOARD_IMAGE_READ_KIND,
  createClipboardImageFailureFact,
  createDecodedClipboardImageFact,
} from "../core/clipboard-facts.js";
import { normalizeOverlayImageBlob } from "../core/image-normalization.js";
import { MAX_WORKING_IMAGE_DIMENSION } from "../core/image-policy.js";
import { createBrowserImageNormalizationDeps } from "../platform/browser-image-normalization.js";

export function createClipboardImageDecoder({
  ownerWindow = globalThis.window,
  logger = null,
  normalizeImageBlob = normalizeOverlayImageBlob,
  imageNormalizationDeps = createBrowserImageNormalizationDeps({
    ownerWindow,
    maxWorkingDimension: MAX_WORKING_IMAGE_DIMENSION,
  }),
} = {}) {
  return {
    decodeImageBlob,
  };

  async function decodeImageBlob(blob, { sourceLabel } = {}) {
    try {
      const image = await normalizeImageBlob(blob, imageNormalizationDeps);
      if (!image) {
        return createUnreadableImageFact();
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
      return createUnreadableImageFact();
    }
  }
}

function createUnreadableImageFact() {
  return createClipboardImageFailureFact({
    kind: CLIPBOARD_IMAGE_READ_KIND.UNREADABLE_IMAGE,
  });
}
