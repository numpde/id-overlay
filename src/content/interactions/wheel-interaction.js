import {
  applyInteractionCommandOutcome,
} from "./command-outcome.js";
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
      return applyInteractionCommandOutcome({
        outcome,
        runtimeBridge,
        logger,
      });
    }, { fallbackValue: false });
  }
}
