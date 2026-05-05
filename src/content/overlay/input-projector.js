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
  // TODO(smell): Input projection still pulls machine state, runtime state,
  // page snapshots, and DOM event coordinates at once. The final input boundary
  // should produce normalized input facts first, then let machine ingress derive
  // allowed user intent from state.
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
  // TODO(smell): Hit testing is computed in the content input projector using
  // render geometry. The final shape should share a pure overlay render model
  // between rendering and input hit testing so those facts cannot diverge.
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
