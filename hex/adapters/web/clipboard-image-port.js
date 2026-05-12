import {
  normalizeReferenceImageSourceResult,
} from "./reference-image-input-port.js";

export function createClipboardImagePortAdapter({
  readClipboardImageHandle,
  normalizeImageHandle,
}) {
  return {
    async readReferenceImage() {
      const clipboardResult = await readClipboardImageHandle().catch(() => ({
        kind: "unavailable",
      }));
      return normalizeReferenceImageSourceResult({
        sourceResult: clipboardResult,
        normalizeImageHandle,
      });
    },
    async readReferenceImageFromPasteEvent({ imageHandle }) {
      return normalizeImageHandle(imageHandle);
    },
  };
}
