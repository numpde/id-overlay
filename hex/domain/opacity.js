export function normalizeOpacity(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError("Opacity must be a finite number.");
  }
  return Math.min(1, Math.max(0, value));
}
