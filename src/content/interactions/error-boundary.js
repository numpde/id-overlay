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
    // TODO(smell): Reset policy is selected by this content boundary, not by
    // the machine-owned gesture/session state. Keep this explicit until runtime
    // error facts can drive reset as a normal transition.
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
    // TODO(smell): Reporting to the machine and logging are two sinks for the
    // same failure fact. A final boundary should fan out a typed result through
    // one effect/logging service instead of formatting here.
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
    // TODO(smell): Fallback values make this boundary partly policy-owned.
    // Prefer callers returning typed recoverable outcomes once adapter failures
    // are normalized at their source boundary.
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
