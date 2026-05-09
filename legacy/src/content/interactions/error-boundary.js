import { createInteractionRuntimeErrorReporter } from "./runtime-error-reporter.js";

export function createInteractionErrorBoundary({
  reportRuntimeError,
  recoverInteraction,
  logger,
  runtimeErrorReporter = createInteractionRuntimeErrorReporter({
    reportRuntimeError,
    logger,
  }),
}) {
  return {
    reportFailure,
    recoverFromFailure,
    runHandledInteraction,
  };

  function reportFailure({
    source,
    operation,
    error,
    message = null,
    recoverable = true,
    details = null,
  } = {}) {
    return runtimeErrorReporter.report({
      source,
      operation,
      error,
      message,
      recoverable,
      details,
    });
  }

  function recoverFromFailure(payload = {}) {
    recoverInteraction();
    return reportFailure(payload);
  }

  function runHandledInteraction(operation, fn, {
    message = null,
    recoverable = true,
    details = null,
  } = {}) {
    try {
      return fn();
    } catch (error) {
      recoverFromFailure({
        operation,
        error,
        message,
        recoverable,
        details,
      });
      return false;
    }
  }
}
