import {
  planMovePlacementEditPreview,
  planMovePlacementEditStart,
} from "../../core/placement-edit-planning.js";
import {
  createPlacementEditPlanningContext,
} from "../../core/placement-edit-context.js";

export function createOverlayMoveDragController({
  pageObservation,
  getMachineState,
  machineActions,
}) {
  let activeMove = null;

  return {
    begin,
    move,
    finish,
    hasActive,
    clear,
  };

  function begin(screenPoint) {
    const snapshot = pageObservation.getSnapshot();
    const editContext = createPlacementEditPlanningContext({
      machineState: getMachineState(),
      snapshot,
    });
    const movePlan = planMovePlacementEditStart({
      editContext,
      startPointerScreenPx: screenPoint,
    });
    if (!movePlan) {
      return false;
    }

    activeMove = {
      startPointerScreenPx: movePlan.startPointerScreenPx,
      startCenterScreenPx: movePlan.startCenterScreenPx,
    };
    machineActions.beginOverlayMove(movePlan);
    return true;
  }

  function move(screenPoint) {
    if (!activeMove) {
      return;
    }

    const snapshot = pageObservation.getSnapshot();
    const editContext = createPlacementEditPlanningContext({
      machineState: getMachineState(),
      snapshot,
    });
    const previewPlan = planMovePlacementEditPreview({
      editContext,
      startPointerScreenPx: activeMove.startPointerScreenPx,
      startCenterScreenPx: activeMove.startCenterScreenPx,
      pointerScreenPx: screenPoint,
    });
    if (!previewPlan) {
      return;
    }
    machineActions.previewOverlayMove(previewPlan);
  }

  function finish({ commitPlacement }) {
    if (commitPlacement && activeMove) {
      machineActions.commitOverlayMove();
    }
    clear();
  }

  function hasActive() {
    return Boolean(activeMove);
  }

  function clear() {
    activeMove = null;
  }
}
