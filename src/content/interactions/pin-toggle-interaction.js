import {
  applyInteractionCommandOutcome,
} from "./command-outcome.js";
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
      runtimeBridge.observePointer(screenPoint);
      return executeToggleAtScreenPoint(screenPoint);
    }, { fallbackValue: false });
  }

  function executeToggleAtScreenPoint(screenPoint) {
    const outcome = pinToggleCommand.toggleAtScreenPoint(screenPoint);
    return applyInteractionCommandOutcome({
      outcome,
      runtimeBridge,
      logger,
    });
  }
}
