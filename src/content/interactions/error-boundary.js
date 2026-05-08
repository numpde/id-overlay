import { createInteractionRuntimeErrorReporter } from "./runtime-error-reporter.js";

export function createInteractionErrorBoundary({
  reportRuntimeError,
  resetInteraction: resetInteractionRuntime,
  logger,
  runtimeErrorReporter = createInteractionRuntimeErrorReporter({
    reportRuntimeError,
    logger,
  }),
}) {
  return {
    report,
    run,
  };

  function report({
    source,
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
    return runtimeErrorReporter.report({
      source,
      operation,
      error,
      message,
      recoverable,
      details,
    });
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
