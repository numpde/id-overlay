import { createClipboardApiImageSource } from "./clipboard-api-image-source.js";
import { createClipboardImageDecoder } from "./clipboard-image-decoder.js";
import { createPasteEventImageSource } from "./paste-event-image-source.js";

export function createClipboardImageReader({
  ownerWindow = globalThis.window,
  logger = null,
  imageDecoder = createClipboardImageDecoder({ ownerWindow, logger }),
  clipboardApiImageSource = createClipboardApiImageSource({
    ownerWindow,
    logger,
    imageDecoder,
  }),
  pasteEventImageSource = createPasteEventImageSource({
    logger,
    imageDecoder,
  }),
} = {}) {
  return {
    readClipboardApiImage: clipboardApiImageSource.readClipboardApiImage,
    readClipboardDataImage: pasteEventImageSource.readClipboardDataImage,
  };
}
