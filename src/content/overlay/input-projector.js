import { resolveInputProjection } from "../../core/input-projection.js";
import { isScreenPointOverOverlayViewModel } from "./view-model.js";

export function createOverlayInputProjector({
  pageProjection,
  getOverlayInputContext,
}) {
  // TODO(smell): Input projection still combines DOM coordinate projection with
  // machine input policy evaluation. The final input boundary should normalize
  // pointer facts first, then let machine ingress derive allowed user intent.
  return {
    screenPointFromEvent,
    resolveMountedInputProjection,
  };

  function screenPointFromEvent(event) {
    return pageProjection.clientPointToScreen({
      x: event.clientX,
      y: event.clientY,
    });
  }

  function resolveMountedInputProjection(screenPoint, options = {}) {
    const context = getOverlayInputContext();
    return resolveInputProjection({
      machineState: context.machineState,
      runtime: context.runtime,
      isPointerOverOverlay: isScreenPointOverOverlayViewModel({
        viewModel: context.viewModel,
        screenPoint,
      }),
      ...options,
    });
  }
}
