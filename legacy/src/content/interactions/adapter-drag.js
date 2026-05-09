import {
  DRAG_MODE,
  isMapPanDragMode,
} from "../../core/interaction-policy.js";
import { createAdapterDragSessionController } from "./adapter-drag-session.js";
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
  const mapPanDrag = createMapPanDragController({
    mapGesture,
    logger,
  });
  const overlayMoveDrag = createOverlayMoveDragController({
    pageObservation,
    getMachineState,
    machineActions,
  });

  return createAdapterDragSessionController({
    sessions: [
      createMapPanDragSession(mapPanDrag),
      createOverlayMoveDragSession(overlayMoveDrag),
    ],
  });
}

function createMapPanDragSession(mapPanDrag) {
  return {
    dragMode: DRAG_MODE.MAP_PAN,
    acceptsDragMode: isMapPanDragMode,
    begin: mapPanDrag.begin,
    move: mapPanDrag.move,
    finish(screenPoint) {
      mapPanDrag.finish(screenPoint);
    },
    clear: mapPanDrag.clear,
  };
}

function createOverlayMoveDragSession(overlayMoveDrag) {
  return {
    dragMode: DRAG_MODE.MOVE_OVERLAY,
    acceptsDragMode: (dragMode) => dragMode === DRAG_MODE.MOVE_OVERLAY,
    begin: overlayMoveDrag.begin,
    move: overlayMoveDrag.move,
    finish(_screenPoint, { commitPlacement }) {
      overlayMoveDrag.finish({ commitPlacement });
    },
    clear: overlayMoveDrag.clear,
  };
}
