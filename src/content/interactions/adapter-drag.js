import {
  DRAG_MODE,
  isKnownDragMode,
  isMapPanDragMode,
} from "../../core/interaction-policy.js";
import { resolvePlacementEditRenderState } from "../../core/placement-edit-render-state.js";
import { getOverlayImage } from "../../core/session.js";
import {
  createRetunedPlacementTransform,
  imagePointToRenderedScreenPoint,
  resolveOverlayScreenTransform,
} from "../../core/transform.js";
import {
  MACHINE_EVENT_KIND,
  MACHINE_PLACEMENT_EDIT_KIND,
} from "../../core/machine/events.js";

export function createAdapterDragController({
  pageAdapter,
  getMachineState,
  dispatchMachine,
  logger,
}) {
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
    const interactionState = resolvePlacementEditRenderState({
      state: getMachineState(),
      snapshot,
    });
    if (!interactionState) {
      return false;
    }

    const image = getOverlayImage(interactionState);
    const screenTransform = resolveOverlayScreenTransform({
      state: interactionState,
      snapshot,
    });
    const centerScreenPx = imagePointToRenderedScreenPoint({
      imagePoint: {
        x: image.width / 2,
        y: image.height / 2,
      },
      transform: screenTransform,
      snapshot,
    });

    isMapPanActive = false;
    overlayMove = {
      startPointerScreenPx: screenPoint,
      startCenterScreenPx: centerScreenPx,
    };
    dispatchMachine({
      type: MACHINE_EVENT_KIND.BEGIN_PLACEMENT_EDIT,
      editKind: MACHINE_PLACEMENT_EDIT_KIND.MOVE,
      renderedPlacement: interactionState.placement,
    });
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

    const nextCenterScreenPx = {
      x: overlayMove.startCenterScreenPx.x + (screenPoint.x - overlayMove.startPointerScreenPx.x),
      y: overlayMove.startCenterScreenPx.y + (screenPoint.y - overlayMove.startPointerScreenPx.y),
    };
    const snapshot = pageAdapter.getSnapshot();
    const state = resolvePlacementEditRenderState({
      state: getMachineState(),
      snapshot,
    });
    if (!state) {
      return;
    }
    const nextPlacement = createRetunedPlacementTransform({
      state,
      snapshot,
      centerScreenPx: nextCenterScreenPx,
    });
    dispatchMachine({
      type: MACHINE_EVENT_KIND.PREVIEW_PLACEMENT_EDIT,
      placement: nextPlacement,
    });
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
