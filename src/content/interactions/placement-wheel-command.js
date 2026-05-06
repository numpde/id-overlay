import {
  planRotatePlacementEdit,
  planScalePlacementEdit,
} from "../../core/placement-edit-planning.js";
import {
  WHEEL_MODE,
} from "../../core/interaction-policy.js";
import {
  createHandledWheelOutcome,
  createUnhandledWheelOutcome,
} from "./wheel-outcome.js";

export function createPlacementWheelCommand({
  pageObservation,
  getMachineState,
  machineActions,
}) {
  return {
    handlePlacementWheel,
  };

  function handlePlacementWheel({ deltaY, wheelMode, screenPoint }) {
    const snapshot = pageObservation.getSnapshot();
    return wheelMode === WHEEL_MODE.ROTATE_OVERLAY
      ? handleRotateWheel({ deltaY, screenPoint, snapshot })
      : handleScaleWheel({ deltaY, screenPoint, snapshot });
  }

  function handleRotateWheel({ deltaY, screenPoint, snapshot }) {
    const rotatePlan = planRotatePlacementEdit({
      machineState: getMachineState(),
      snapshot,
      anchorScreenPx: screenPoint,
      deltaY,
    });
    if (!rotatePlan) {
      return createUnhandledWheelOutcome("no-placement");
    }
    machineActions.rotateOverlayPlacement(rotatePlan);
    return createHandledWheelOutcome({
      pointerScreenPx: screenPoint,
      log: {
        level: "info",
        message: "Rotated overlay placement",
        details: { rotationRad: rotatePlan.rotationRad, deltaY },
      },
    });
  }

  function handleScaleWheel({ deltaY, screenPoint, snapshot }) {
    const scalePlan = planScalePlacementEdit({
      machineState: getMachineState(),
      snapshot,
      anchorScreenPx: screenPoint,
      deltaY,
    });
    if (!scalePlan) {
      return createUnhandledWheelOutcome("no-placement");
    }
    machineActions.scaleOverlayPlacement(scalePlan);
    return createHandledWheelOutcome({
      pointerScreenPx: screenPoint,
      log: {
        level: "info",
        message: "Scaled overlay placement",
        details: { scale: scalePlan.scale, deltaY },
      },
    });
  }
}
