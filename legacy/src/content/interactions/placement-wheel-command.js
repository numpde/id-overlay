import {
  planRotatePlacementEdit,
  planScalePlacementEdit,
} from "../../core/placement-edit-planning.js";
import {
  createPlacementEditPlanningContext,
} from "../../core/placement-edit-context.js";
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
    const editContext = createPlacementEditPlanningContext({
      machineState: getMachineState(),
      snapshot,
    });
    return wheelMode === WHEEL_MODE.ROTATE_OVERLAY
      ? handleRotateWheel({ deltaY, screenPoint, editContext })
      : handleScaleWheel({ deltaY, screenPoint, editContext });
  }

  function handleRotateWheel({ deltaY, screenPoint, editContext }) {
    const rotatePlan = planRotatePlacementEdit({
      editContext,
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

  function handleScaleWheel({ deltaY, screenPoint, editContext }) {
    const scalePlan = planScalePlacementEdit({
      editContext,
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
