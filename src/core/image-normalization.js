import { resolveWorkingImageDimensions } from "./image-policy.js";

export function createNormalizedOverlayImage({
  workingSrc,
  workingWidth,
  workingHeight,
  originalWidth,
  originalHeight,
}) {
  // TODO(smell): Canonical image construction and metadata normalization repeat
  // the same dimension/source validation. Extract a single internal validator
  // before adding any more accepted image shapes.
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
  deps,
) {
  if (!blob || !deps) {
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
