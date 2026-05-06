import {
  createHandledWheelOutcome,
} from "./wheel-outcome.js";

export function createOpacityWheelCommand({
  machineActions,
}) {
  return {
    handleOpacityWheel,
  };

  function handleOpacityWheel({ deltaY, screenPoint }) {
    const result = machineActions.changeOpacityByWheel({ deltaY });
    const nextOpacity = result.state.session.opacity;
    return createHandledWheelOutcome({
      pointerScreenPx: screenPoint,
      log: {
        level: "info",
        message: "Adjusted overlay opacity",
        details: { opacity: nextOpacity, deltaY },
      },
    });
  }
}
