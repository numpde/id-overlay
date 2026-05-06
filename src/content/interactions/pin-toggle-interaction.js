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
    logger,
  });

  return {
    toggleAtScreenPoint,
  };

  function toggleAtScreenPoint(screenPoint) {
    return errorBoundary.run("handle-toggle-pin", () => {
      runtimeBridge.observePointer(screenPoint);
      return pinToggleCommand.toggleAtScreenPoint(screenPoint);
    }, { fallbackValue: false });
  }
}
