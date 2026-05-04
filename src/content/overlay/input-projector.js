import {
  isImagePointWithinBounds,
  resolveOverlayScreenTransform,
  screenPointToRenderedImagePoint,
} from "../../core/transform.js";
import { getOverlayImage, hasOverlayImageSession } from "../../core/session.js";
import { resolveInputProjection } from "../../core/input-projection.js";

export function createOverlayInputProjector({
  pageAdapter,
  getMachineState,
  getRuntimeState,
  getSnapshot,
}) {
  return {
    screenPointFromEvent,
    resolveMountedInputProjection,
  };

  function screenPointFromEvent(event) {
    return pageAdapter.clientPointToScreen({
      x: event.clientX,
      y: event.clientY,
    });
  }

  function resolveMountedInputProjection(screenPoint, options = {}) {
    return resolveInputProjection({
      machineState: getMachineState(),
      runtime: getRuntimeState(),
      isPointerOverOverlay: isScreenPointOverOverlay({
        machineState: getMachineState(),
        snapshot: getSnapshot(),
        screenPoint,
      }),
      ...options,
    });
  }
}

export function isScreenPointOverOverlay({
  machineState,
  snapshot,
  screenPoint,
}) {
  const state = machineState.session ?? machineState;
  if (!hasOverlayImageSession(state)) {
    return false;
  }
  const image = getOverlayImage(state);
  const transform = resolveOverlayScreenTransform({
    state: machineState,
    snapshot,
  });
  if (!transform) {
    return false;
  }
  const imagePoint = screenPointToRenderedImagePoint({
    screenPoint,
    transform,
    snapshot,
  });
  return isImagePointWithinBounds(imagePoint, image);
}
