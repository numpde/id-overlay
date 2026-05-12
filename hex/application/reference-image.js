export function isReferenceImageData(value) {
  return Boolean(
    value
      && typeof value.imageDataRef === "string"
      && value.imageDataRef.length > 0
      && !isRuntimeScopedImageRef(value.imageDataRef)
      && isPositiveFiniteNumber(value.intrinsicSizePx?.width)
      && isPositiveFiniteNumber(value.intrinsicSizePx?.height),
  );
}

function isRuntimeScopedImageRef(imageDataRef) {
  return /^(?:blob|filesystem|[a-z][a-z0-9+.-]*-extension):/.test(imageDataRef);
}

function isPositiveFiniteNumber(value) {
  return Number.isFinite(value) && value > 0;
}
