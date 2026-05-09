export function createClipboardImagePortAdapter({
  readClipboardImageHandle,
  normalizeImageHandle,
}) {
  return {
    async readReferenceImage() {
      const clipboardResult = await readClipboardImageHandle();
      if (clipboardResult.kind === "empty") {
        return {
          kind: "empty",
        };
      }
      if (clipboardResult.kind === "unsupported") {
        return {
          kind: "failed",
          reason: "unsupported-clipboard-content",
        };
      }
      return normalizeImageHandle(clipboardResult.imageHandle);
    },
    async readReferenceImageFromPasteEvent({ imageHandle }) {
      return normalizeImageHandle(imageHandle);
    },
  };
}
