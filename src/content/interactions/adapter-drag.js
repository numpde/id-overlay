import {
  DRAG_MODE,
  isKnownDragMode,
  isMapPanDragMode,
} from "../../core/interaction-policy.js";
import {
  planMovePlacementEditPreview,
  planMovePlacementEditStart,
} from "../../core/placement-edit-planning.js";

export function createAdapterDragController({
  pageObservation,
  mapGesture,
  getMachineState,
  machineActions,
  logger,
}) {
  // TODO(smell): Adapter drag owns both page gesture forwarding and overlay
  // placement edit dispatch. Split map-pan and overlay-move commands once a
  // shared gesture lifecycle port replaces direct adapterDrag/runtime coupling.
  let isMapPanActive = false;
  let overlayMove = null;

  function begin({ button, screenPoint, dragMode }) {
    if (button !== 0 || !isKnownDragMode(dragMode)) {
      return false;
    }

    if (isMapPanDragMode(dragMode)) {
      const beganMapPan = mapGesture.beginMapPan?.(screenPoint) === true;
      if (!beganMapPan) {
        logger.warn("Map pan requested, but the map gesture port could not start it");
        return false;
      }
      isMapPanActive = true;
      overlayMove = null;
      return true;
    }

    if (dragMode !== DRAG_MODE.MOVE_OVERLAY) {
      return false;
    }

    const snapshot = pageObservation.getSnapshot();
    const movePlan = planMovePlacementEditStart({
      machineState: getMachineState(),
      snapshot,
      startPointerScreenPx: screenPoint,
    });
    if (!movePlan) {
      return false;
    }

    isMapPanActive = false;
    overlayMove = {
      startPointerScreenPx: movePlan.startPointerScreenPx,
      startCenterScreenPx: movePlan.startCenterScreenPx,
    };
    // TODO(smell): The drag command dispatches a planned machine event instead
    // of reporting a user overlay-move start. The machine should own edit
    // lifecycle state once content has supplied the projected gesture facts.
    machineActions.applyPlacementEditPlan(movePlan);
    return true;
  }

  function move(screenPoint) {
    if (!hasActive()) {
      return;
    }

    if (isMapPanActive) {
      mapGesture.updateMapPan(screenPoint);
      return;
    }

    const snapshot = pageObservation.getSnapshot();
    const previewPlan = planMovePlacementEditPreview({
      machineState: getMachineState(),
      snapshot,
      startPointerScreenPx: overlayMove.startPointerScreenPx,
      startCenterScreenPx: overlayMove.startCenterScreenPx,
      pointerScreenPx: screenPoint,
    });
    if (!previewPlan) {
      return;
    }
    // TODO(smell): Preview updates are executable events produced outside the
    // machine. Keep projection math outside, but move edit interpretation and
    // event construction behind machine user-intent handling.
    machineActions.applyPlacementEditPlan(previewPlan);
  }

  function end(screenPoint) {
    if (!hasActive()) {
      return false;
    }
    move(screenPoint);
    finish(screenPoint, { commitPlacement: true });
    clear();
    return true;
  }

  function cancel(endPointerScreenPx, { commitPlacement }) {
    finish(endPointerScreenPx, { commitPlacement });
    clear();
  }

  function finish(endPointerScreenPx, { commitPlacement }) {
    if (isMapPanActive) {
      mapGesture.endMapPan?.(endPointerScreenPx);
      return;
    }
    if (commitPlacement && overlayMove) {
      // TODO(smell): Content decides to commit a placement edit by low-level
      // command. The final gesture lifecycle should let the machine decide
      // whether an ended overlay-move intent commits, cancels, or no-ops.
      machineActions.finishPlacementEditPlan();
    }
  }

  function hasActive() {
    return isMapPanActive || Boolean(overlayMove);
  }

  function getActiveDragMode() {
    if (isMapPanActive) {
      return DRAG_MODE.MAP_PAN;
    }
    if (overlayMove) {
      return DRAG_MODE.MOVE_OVERLAY;
    }
    return null;
  }

  function clear() {
    isMapPanActive = false;
    overlayMove = null;
  }

  return {
    begin,
    move,
    end,
    cancel,
    hasActive,
    getActiveDragMode,
    clear,
  };
}
