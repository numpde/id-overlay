import { createWheelCommand } from "./wheel-command.js";

export function createWheelInteraction({
  pageObservation,
  mapGesture,
  getMachineState,
  machineActions,
  runtimeBridge,
  errorBoundary,
  logger,
}) {
  // TODO(smell): Wheel interaction consumes command outcomes and mutates runtime
  // pointer separately from the wheel transition. The final ingress should make
  // pointer observation and wheel user intent one coherent machine fact.
  const wheelCommand = createWheelCommand({
    pageObservation,
    mapGesture,
    getMachineState,
    machineActions,
  });

  return {
    handleWheel,
  };

  function handleWheel({ deltaY, wheelMode, screenPoint }) {
    return errorBoundary.run("handle-wheel", () => {
      const outcome = wheelCommand.handleWheel({ deltaY, wheelMode, screenPoint });
      logInteractionOutcome(outcome);
      if (!outcome.handled) {
        return false;
      }
      runtimeBridge.updatePointer(outcome.pointerScreenPx);
      return true;
    }, { fallbackValue: false });
  }

  function logInteractionOutcome(outcome) {
    if (!outcome.log) {
      return;
    }
    const { level, message, details } = outcome.log;
    if (details === undefined) {
      logger[level]?.(message);
      return;
    }
    logger[level]?.(message, details);
  }
}
