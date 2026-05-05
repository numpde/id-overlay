import { createPinToggleCommand } from "./pin-toggle-command.js";

export function createPinToggleInteraction({
  pageObservation,
  pageProjection,
  getMachineState,
  machineActions,
  runtimeBridge,
  errorBoundary,
  logger,
}) {
  // TODO(smell): Pin-toggle interaction interprets command outcomes to update
  // runtime pointer and logging. After user-intent ingress, this wrapper should
  // only report the attempted activation fact and observe machine results.
  const pinToggleCommand = createPinToggleCommand({
    pageObservation,
    pageProjection,
    getMachineState,
    machineActions,
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
