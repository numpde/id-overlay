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
    logger,
  });

  return {
    handleWheel,
  };

  function handleWheel({ deltaY, wheelMode, screenPoint }) {
    return errorBoundary.run("handle-wheel", () => {
      const handled = wheelCommand.handleWheel({ deltaY, wheelMode, screenPoint });
      if (handled) {
        runtimeBridge.observePointer(screenPoint);
      }
      return handled;
    }, { fallbackValue: false });
  }
}
