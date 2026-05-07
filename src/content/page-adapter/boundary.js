export function createPageAdapterBoundary({ logger }) {
  return function runPageAdapterBoundary(operation, fn, fallbackValue = undefined) {
    try {
      return fn();
    } catch (error) {
      logger.error("Page adapter boundary failed", { operation }, error);
      return fallbackValue;
    }
  };
}
