import {
  planRotatePlacementEdit,
  planScalePlacementEdit,
} from "../../core/placement-edit-planning.js";
import {
  WHEEL_MODE,
} from "../../core/interaction-policy.js";

export function createPlacementWheelCommand({
  pageObservation,
  getMachineState,
  machineActions,
  logger,
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
      return false;
    }
    machineActions.rotateOverlayPlacement(rotatePlan);
    logger.info("Rotated overlay placement", {
      rotationRad: rotatePlan.rotationRad,
      deltaY,
    });
    return true;
  }

  function handleScaleWheel({ deltaY, screenPoint, snapshot }) {
    const scalePlan = planScalePlacementEdit({
      machineState: getMachineState(),
      snapshot,
      anchorScreenPx: screenPoint,
      deltaY,
    });
    if (!scalePlan) {
      return false;
    }
    machineActions.scaleOverlayPlacement(scalePlan);
    logger.info("Scaled overlay placement", {
      scale: scalePlan.scale,
      deltaY,
    });
    return true;
  }
}
