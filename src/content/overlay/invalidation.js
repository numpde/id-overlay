export const OVERLAY_INVALIDATION_SOURCE = Object.freeze({
  MACHINE: "machine",
  PAGE: "page",
  RUNTIME: "runtime",
});

export function createOverlayInvalidation(source, payload = {}) {
  return Object.freeze({
    source,
    ...payload,
  });
}
