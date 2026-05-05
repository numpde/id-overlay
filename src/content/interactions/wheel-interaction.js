import { createWheelCommand } from "./wheel-command.js";

export function createWheelInteraction({
  pageAdapter,
  getMachineState,
  dispatchMachine,
  runtimeBridge,
  errorBoundary,
  logger,
}) {
  const wheelCommand = createWheelCommand({
    pageAdapter,
    getMachineState,
    dispatchMachine,
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
