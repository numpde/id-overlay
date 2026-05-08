import { createRuntimeError } from "../../core/runtime-error.js";

const DEFAULT_RUNTIME_ERROR_LOG_MESSAGE = "Runtime boundary failed";

export function createInteractionRuntimeErrorReporter({
  reportRuntimeError,
  logger,
  logMessage = DEFAULT_RUNTIME_ERROR_LOG_MESSAGE,
}) {
  return {
    report,
  };

  function report({
    source,
    operation,
    error,
    message = null,
    recoverable = true,
    details = null,
  } = {}) {
    const runtimeError = createRuntimeError({
      source,
      operation,
      error,
      message,
      recoverable,
      details,
    });
    reportRuntimeError(runtimeError);
    logger.error(logMessage, runtimeError, error);
    return runtimeError;
  }
}
