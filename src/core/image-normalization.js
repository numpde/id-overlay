import { MAX_WORKING_IMAGE_DIMENSION, resolveWorkingImageDimensions } from "./image-policy.js";

export function createNormalizedOverlayImage({
  workingSrc,
  workingWidth,
  workingHeight,
  originalWidth,
  originalHeight,
}) {
  if (
    typeof workingSrc !== "string" ||
    !workingSrc ||
    !Number.isFinite(workingWidth) ||
    !Number.isFinite(workingHeight) ||
    workingWidth <= 0 ||
    workingHeight <= 0 ||
    !Number.isFinite(originalWidth) ||
    !Number.isFinite(originalHeight) ||
    originalWidth <= 0 ||
    originalHeight <= 0
  ) {
    return null;
  }

  return {
    src: workingSrc,
    width: workingWidth,
    height: workingHeight,
    original: {
      width: originalWidth,
      height: originalHeight,
    },
    working: {
      src: workingSrc,
      width: workingWidth,
      height: workingHeight,
      scaleFromOriginal: workingWidth / originalWidth,
    },
  };
}

export function getOverlayImageWorkingDimensions(image) {
  if (!image) {
    return null;
  }
  return {
    src: image.src,
    width: image.width,
    height: image.height,
    scaleFromOriginal: image.working?.scaleFromOriginal ?? 1,
  };
}

export function getOverlayImageOriginalDimensions(image) {
  if (!image?.original) {
    return null;
  }
  return {
    width: image.original.width,
    height: image.original.height,
  };
}

export function getOverlayImageLoadStats(image) {
  const working = getOverlayImageWorkingDimensions(image);
  const original = getOverlayImageOriginalDimensions(image);
  if (!working || !original) {
    return null;
  }
  return {
    workingWidth: working.width,
    workingHeight: working.height,
    originalWidth: original.width,
    originalHeight: original.height,
    wasResized: working.width !== original.width || working.height !== original.height,
  };
}

export function normalizeOverlayImageMetadata(image) {
  if (!image) {
    return null;
  }

  const workingSrc = typeof image.working?.src === "string"
    ? image.working.src
    : typeof image.src === "string"
      ? image.src
      : null;
  const workingWidth = Number(image.working?.width ?? image.width);
  const workingHeight = Number(image.working?.height ?? image.height);
  const originalWidth = Number(image.original?.width ?? workingWidth);
  const originalHeight = Number(image.original?.height ?? workingHeight);

  if (
    !workingSrc ||
    !Number.isFinite(workingWidth) ||
    !Number.isFinite(workingHeight) ||
    workingWidth <= 0 ||
    workingHeight <= 0 ||
    !Number.isFinite(originalWidth) ||
    !Number.isFinite(originalHeight) ||
    originalWidth <= 0 ||
    originalHeight <= 0
  ) {
    return null;
  }

  return createNormalizedOverlayImage({
    workingSrc,
    workingWidth,
    workingHeight,
    originalWidth,
    originalHeight,
  });
}

export async function normalizeOverlayImageBlob(
  blob,
  deps = createBrowserImageNormalizationDeps(),
) {
  if (!blob) {
    return null;
  }

  const sourceUrl = await deps.readBlobAsDataUrl(blob);
  const original = await deps.measureImage(sourceUrl);
  const workingDimensions = resolveWorkingImageDimensions({
    width: original.width,
    height: original.height,
    maxDimension: deps.maxWorkingDimension,
  });

  if (!workingDimensions) {
    return null;
  }

  const workingSrc = workingDimensions.wasResized
    ? await deps.resizeImage({
        src: sourceUrl,
        width: workingDimensions.width,
        height: workingDimensions.height,
      })
    : sourceUrl;

  return createNormalizedOverlayImage({
    workingSrc,
    workingWidth: workingDimensions.width,
    workingHeight: workingDimensions.height,
    originalWidth: original.width,
    originalHeight: original.height,
  });
}

export function createBrowserImageNormalizationDeps(ownerWindow = globalThis.window) {
  return {
    maxWorkingDimension: MAX_WORKING_IMAGE_DIMENSION,
    readBlobAsDataUrl(blob) {
      return readBlobAsDataUrl(blob, ownerWindow);
    },
    measureImage(src) {
      return measureImageSource(src, ownerWindow);
    },
    resizeImage({ src, width, height }) {
      return resizeImageSource({ src, width, height }, ownerWindow);
    },
  };
}

function readBlobAsDataUrl(blob, ownerWindow) {
  return new Promise((resolve, reject) => {
    const reader = new ownerWindow.FileReader();
    reader.addEventListener("load", () => resolve(reader.result));
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsDataURL(blob);
  });
}

function measureImageSource(src, ownerWindow) {
  return new Promise((resolve, reject) => {
    const image = new ownerWindow.Image();
    image.addEventListener("load", () => {
      resolve({
        width: image.naturalWidth,
        height: image.naturalHeight,
      });
    });
    image.addEventListener("error", reject);
    image.src = src;
  });
}

function resizeImageSource({ src, width, height }, ownerWindow) {
  return new Promise((resolve, reject) => {
    const image = new ownerWindow.Image();
    image.addEventListener("load", () => {
      const canvas = ownerWindow.document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) {
        reject(new Error("Canvas 2D context is unavailable."));
        return;
      }
      context.drawImage(image, 0, 0, width, height);
      resolve(canvas.toDataURL("image/png"));
    });
    image.addEventListener("error", reject);
    image.src = src;
  });
}
