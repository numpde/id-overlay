export function createPageAdapterBoundary({ logger }) {
  return function runPageAdapterBoundary(operation, fn) {
    try {
      return {
        ok: true,
        value: fn(),
      };
    } catch (error) {
      logger.error("Page adapter boundary failed", { operation }, error);
      return {
        ok: false,
        error,
      };
    }
  };
}
