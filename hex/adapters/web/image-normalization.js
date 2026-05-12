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

export function createBrowserImageNormalizer({
  ownerWindow = globalThis.window,
} = {}) {
  return (imageHandle) => normalizeClipboardImage({
    imageHandle,
    decodeImage: (handle) => decodeBrowserImageHandle({
      imageHandle: handle,
      ownerWindow,
    }),
  });
}

export async function decodeBrowserImageHandle({
  imageHandle,
  ownerWindow = globalThis.window,
}) {
  const imageDataRef = await readBlobAsDataUrl({
    blob: imageHandle.runtimeBlob,
    ownerWindow,
  });
  return {
    imageDataRef,
    intrinsicSizePx: await loadImageSize({
      imageDataRef,
      ownerWindow,
    }),
  };
}

function readBlobAsDataUrl({ blob, ownerWindow }) {
  return new Promise((resolve, reject) => {
    const FileReader = ownerWindow?.FileReader;
    if (typeof FileReader !== "function") {
      reject(new TypeError("FileReader unavailable."));
      return;
    }
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new TypeError("Image data URL unavailable."));
    });
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsDataURL(blob);
  });
}

function loadImageSize({ imageDataRef, ownerWindow }) {
  return new Promise((resolve, reject) => {
    const Image = ownerWindow?.Image;
    if (typeof Image !== "function") {
      reject(new TypeError("Image unavailable."));
      return;
    }
    const image = new Image();
    image.addEventListener("load", () => resolve({
      width: image.naturalWidth,
      height: image.naturalHeight,
    }));
    image.addEventListener("error", () => reject(new TypeError("Image load failed.")));
    image.src = imageDataRef;
  });
}
