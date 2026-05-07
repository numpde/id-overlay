import {
  DRAG_MODE,
  isKnownDragMode,
  isMapPanDragMode,
} from "../../core/interaction-policy.js";
import {
  createMapPanDragController,
} from "./map-pan-drag.js";
import {
  createOverlayMoveDragController,
} from "./overlay-move-drag.js";

export function createAdapterDragController({
  pageObservation,
  mapGesture,
  getMachineState,
  machineActions,
  logger,
}) {
  // TODO(smell): Adapter drag is a content-side multiplexer with its own active
  // drag state, parallel to machine runtime gesture state. The final shape
  // should let one machine-authored gesture session select the adapter port and
  // own cancellation/commit semantics.
  const mapPanDrag = createMapPanDragController({
    mapGesture,
    logger,
  });
  const overlayMoveDrag = createOverlayMoveDragController({
    pageObservation,
    getMachineState,
    machineActions,
  });

  function begin({ button, screenPoint, dragMode }) {
    // TODO(smell): Drag-mode routing is duplicated content-side orchestration
    // around machine runtime state. The ideal machine gesture session should
    // select the adapter port and expose one begin/move/end command surface.
    if (button !== 0 || !isKnownDragMode(dragMode)) {
      return false;
    }

    if (isMapPanDragMode(dragMode)) {
      overlayMoveDrag.clear();
      return mapPanDrag.begin(screenPoint);
    }

    if (dragMode !== DRAG_MODE.MOVE_OVERLAY) {
      return false;
    }

    mapPanDrag.clear();
    return overlayMoveDrag.begin(screenPoint);
  }

  function move(screenPoint) {
    if (!hasActive()) {
      return;
    }

    if (mapPanDrag.hasActive()) {
      mapPanDrag.move(screenPoint);
      return;
    }

    overlayMoveDrag.move(screenPoint);
  }

  function end(screenPoint) {
    if (!hasActive()) {
      return false;
    }
    move(screenPoint);
    finish(screenPoint, { commitPlacement: true });
    return true;
  }

  function cancel(endPointerScreenPx, { commitPlacement }) {
    finish(endPointerScreenPx, { commitPlacement });
  }

  function finish(endPointerScreenPx, { commitPlacement }) {
    // TODO(smell): Commit/cancel semantics leak through a generic adapter-drag
    // multiplexer. Final shape should make map-pan and overlay-placement
    // sessions distinct machine-owned transitions.
    if (mapPanDrag.hasActive()) {
      mapPanDrag.finish(endPointerScreenPx);
      return;
    }
    overlayMoveDrag.finish({ commitPlacement });
  }

  function hasActive() {
    return mapPanDrag.hasActive() || overlayMoveDrag.hasActive();
  }

  function getActiveDragMode() {
    if (mapPanDrag.hasActive()) {
      return DRAG_MODE.MAP_PAN;
    }
    if (overlayMoveDrag.hasActive()) {
      return DRAG_MODE.MOVE_OVERLAY;
    }
    return null;
  }

  function clear() {
    mapPanDrag.clear();
    overlayMoveDrag.clear();
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
