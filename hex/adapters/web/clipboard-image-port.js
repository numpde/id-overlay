export function createClipboardImagePortAdapter({
  readClipboardImageHandle,
  normalizeImageHandle,
}) {
  return {
    async readReferenceImage() {
      const clipboardResult = await readClipboardImageHandle().catch(() => ({
        kind: "unavailable",
      }));
      if (clipboardResult.kind === "unavailable") {
        return {
          kind: "failed",
          reason: "source-unavailable",
        };
      }
      if (clipboardResult.kind === "empty") {
        return {
          kind: "empty",
        };
      }
      if (clipboardResult.kind === "unsupported") {
        return {
          kind: "failed",
          reason: "unsupported-image",
        };
      }
      return normalizeImageHandle(clipboardResult.imageHandle);
    },
    async readReferenceImageFromPasteEvent({ imageHandle }) {
      return normalizeImageHandle(imageHandle);
    },
  };
}
