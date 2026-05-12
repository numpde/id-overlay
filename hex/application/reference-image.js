export function isReferenceImageData(value) {
  return Boolean(
    isRecord(value)
      && hasOnlyReferenceImageKeys(value)
      && typeof value.imageDataRef === "string"
      && value.imageDataRef.length > 0
      && !isRuntimeScopedImageRef(value.imageDataRef)
      && isPositiveFiniteNumber(value.intrinsicSizePx?.width)
      && isPositiveFiniteNumber(value.intrinsicSizePx?.height),
  );
}

const REFERENCE_IMAGE_KEYS = new Set([
  "imageDataRef",
  "intrinsicSizePx",
]);

function hasOnlyReferenceImageKeys(value) {
  return Object.keys(value).every((key) => REFERENCE_IMAGE_KEYS.has(key));
}

function isRuntimeScopedImageRef(imageDataRef) {
  return /^(?:blob|filesystem|[a-z][a-z0-9+.-]*-extension):/.test(imageDataRef);
}

function isPositiveFiniteNumber(value) {
  return Number.isFinite(value) && value > 0;
}

function isRecord(value) {
  return value
    && typeof value === "object"
    && !Array.isArray(value);
}
