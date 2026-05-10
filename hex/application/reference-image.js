export function isReferenceImageData(value) {
  return Boolean(
    value
      && typeof value.imageDataRef === "string"
      && value.imageDataRef.length > 0
      && isPositiveFiniteNumber(value.intrinsicSizePx?.width)
      && isPositiveFiniteNumber(value.intrinsicSizePx?.height),
  );
}

function isPositiveFiniteNumber(value) {
  return Number.isFinite(value) && value > 0;
}
