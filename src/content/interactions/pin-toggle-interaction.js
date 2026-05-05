import { createPinToggleCommand } from "./pin-toggle-command.js";

export function createPinToggleInteraction({
  pageAdapter,
  getMachineState,
  dispatchMachine,
  runtimeBridge,
  errorBoundary,
  logger,
}) {
  const pinToggleCommand = createPinToggleCommand({
    pageAdapter,
    getMachineState,
    dispatchMachine,
  });

  return {
    toggleAtScreenPoint,
  };

  function toggleAtScreenPoint(screenPoint) {
    return errorBoundary.run("handle-toggle-pin", () => {
      runtimeBridge.updatePointer(screenPoint);
      return executeToggleAtScreenPoint(screenPoint);
    }, { fallbackValue: false });
  }

  function executeToggleAtScreenPoint(screenPoint) {
    const outcome = pinToggleCommand.toggleAtScreenPoint(screenPoint);
    if (!outcome.handled) {
      logger.warn("Pin toggle requested without a valid pin context", {
        reason: outcome.reason,
      });
      return false;
    }
    logger.info("Toggled registration pin", {
      pinId: outcome.existingPinId,
    });
    runtimeBridge.updatePointer(outcome.pointerScreenPx);
    return true;
  }
}
