export async function normalizeClipboardImage({ imageHandle, decodeImage }) {
  try {
    const decoded = await decodeImage(imageHandle);
    return {
      kind: "accepted",
      referenceImage: {
        imageDataRef: decoded.imageDataRef,
        intrinsicSizePx: decoded.intrinsicSizePx,
      },
    };
  } catch {
    return {
      kind: "failed",
      reason: "decode-failed",
    };
  }
}
