export const MAX_WORKING_IMAGE_DIMENSION = 2048;

export function resolveWorkingImageDimensions({
  width,
  height,
  maxDimension = MAX_WORKING_IMAGE_DIMENSION,
}) {
  const normalizedWidth = Number(width);
  const normalizedHeight = Number(height);
  const normalizedMaxDimension = Number(maxDimension);

  if (
    !Number.isFinite(normalizedWidth) ||
    !Number.isFinite(normalizedHeight) ||
    normalizedWidth <= 0 ||
    normalizedHeight <= 0
  ) {
    return null;
  }

  if (!Number.isFinite(normalizedMaxDimension) || normalizedMaxDimension <= 0) {
    return {
      width: normalizedWidth,
      height: normalizedHeight,
      scaleFromOriginal: 1,
      wasResized: false,
    };
  }

  const longestSide = Math.max(normalizedWidth, normalizedHeight);
  if (longestSide <= normalizedMaxDimension) {
    return {
      width: normalizedWidth,
      height: normalizedHeight,
      scaleFromOriginal: 1,
      wasResized: false,
    };
  }

  const scaleFromOriginal = normalizedMaxDimension / longestSide;
  const workingWidth = Math.max(1, Math.round(normalizedWidth * scaleFromOriginal));
  const workingHeight = Math.max(1, Math.round(normalizedHeight * scaleFromOriginal));

  return {
    width: workingWidth,
    height: workingHeight,
    scaleFromOriginal,
    wasResized: true,
  };
}
