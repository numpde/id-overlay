import { createRuntimeError, RUNTIME_ERROR_SOURCE } from "../../core/runtime-error.js";
import {
  MACHINE_EVENT_KIND,
  MACHINE_STATUS_NOTICE_KIND,
} from "../../core/machine/events.js";

export function createInteractionErrorBoundary({
  dispatchMachine,
  resetInteraction: resetInteractionRuntime,
  logger,
}) {
  // TODO(smell): Interaction errors are reported by constructing status notice
  // commands in content. The final boundary should report runtime failure facts
  // and let the machine derive status presentation and recovery effects.
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
    dispatchMachine({
      type: MACHINE_EVENT_KIND.REPORT_STATUS_NOTICE,
      noticeKind: MACHINE_STATUS_NOTICE_KIND.RUNTIME_ERROR,
      noticePayload: {
        error: runtimeError,
      },
    });
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
