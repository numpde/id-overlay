export function createPageAdapterBoundary({ logger }) {
  return function runPageAdapterBoundary(operation, fn, fallbackValue = undefined) {
    // TODO(smell): Page adapter failures collapse to caller-provided fallback
    // values. The ideal port boundary should return typed degraded page facts
    // so downstream code can distinguish approximate, stale, and failed reads.
    try {
      return fn();
    } catch (error) {
      logger.error("Page adapter boundary failed", { operation }, error);
      return fallbackValue;
    }
  };
}
