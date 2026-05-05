import {
  DRAG_MODE,
  isKnownDragMode,
  isMapPanDragMode,
} from "../../core/interaction-policy.js";
import {
  planMovePlacementEditPreview,
  planMovePlacementEditStart,
} from "../../core/placement-edit-planning.js";
import { MACHINE_EVENT_KIND } from "../../core/machine/events.js";

export function createAdapterDragController({
  pageAdapter,
  getMachineState,
  dispatchMachine,
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
      const beganMapPan = pageAdapter.beginMapPan?.(screenPoint) === true;
      if (!beganMapPan) {
        logger.warn("Map pan requested, but the page adapter could not start it");
        return false;
      }
      isMapPanActive = true;
      overlayMove = null;
      return true;
    }

    if (dragMode !== DRAG_MODE.MOVE_OVERLAY) {
      return false;
    }

    const snapshot = pageAdapter.getSnapshot();
    const movePlan = planMovePlacementEditStart({
      state: getMachineState(),
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
    dispatchMachine(movePlan.event);
    return true;
  }

  function move(screenPoint) {
    if (!hasActive()) {
      return;
    }

    if (isMapPanActive) {
      pageAdapter.updateMapPan(screenPoint);
      return;
    }

    const snapshot = pageAdapter.getSnapshot();
    const previewPlan = planMovePlacementEditPreview({
      state: getMachineState(),
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
    dispatchMachine(previewPlan.event);
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
      pageAdapter.endMapPan?.(endPointerScreenPx);
      return;
    }
    if (commitPlacement && overlayMove) {
      // TODO(smell): Content decides to commit a placement edit by low-level
      // command. The final gesture lifecycle should let the machine decide
      // whether an ended overlay-move intent commits, cancels, or no-ops.
      dispatchMachine({
        type: MACHINE_EVENT_KIND.COMMIT_PLACEMENT_EDIT,
      });
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
