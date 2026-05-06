import { createRuntimeError, RUNTIME_ERROR_SOURCE } from "../../core/runtime-error.js";

export function createInteractionErrorBoundary({
  reportRuntimeError,
  resetInteraction: resetInteractionRuntime,
  logger,
}) {
  // TODO(smell): Interaction error handling couples local gesture reset,
  // machine runtime-error reporting, logger formatting, and fallback values.
  // The ideal boundary should convert thrown adapter failures into one typed
  // external fact, with reset policy selected by the machine/gesture session.
  return {
    report,
    run,
  };

  function report({
    source = RUNTIME_ERROR_SOURCE.INTERACTIONS,
    operation,
    error,
    message = null,
    recoverable = true,
    details = null,
    resetInteraction = true,
  } = {}) {
    if (resetInteraction) {
      resetInteractionRuntime();
    }
    const runtimeError = createRuntimeError({
      source,
      operation,
      error,
      message,
      recoverable,
      details,
    });
    reportRuntimeError(runtimeError);
    logger.error("Runtime boundary failed", runtimeError, error);
    return runtimeError;
  }

  function run(operation, fn, {
    fallbackValue = null,
    message = null,
    recoverable = true,
    details = null,
    resetInteraction = true,
  } = {}) {
    try {
      return fn();
    } catch (error) {
      report({
        source: RUNTIME_ERROR_SOURCE.INTERACTIONS,
        operation,
        error,
        message,
        recoverable,
        details,
        resetInteraction,
      });
      return fallbackValue;
    }
  }
}
