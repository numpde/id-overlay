import {
  resolveActivationProjection,
  resolvePointerMoveProjection,
  resolvePointerSequenceProjection,
  resolveWheelProjection,
} from "../../core/input-projection.js";
import { isScreenPointOverOverlayViewModel } from "./view-model.js";

export function createOverlayInputProjector({
  pageProjection,
  getOverlayInputContext,
}) {
  return {
    screenPointFromEvent,
    resolveMountedActivationProjection,
    resolveMountedPointerLeaveProjection,
    resolveMountedPointerMoveProjection,
    resolveMountedPointerSequenceProjection,
    resolveMountedWheelProjection,
  };

  function screenPointFromEvent(event) {
    return pageProjection.clientPointToScreen({
      x: event.clientX,
      y: event.clientY,
    });
  }

  function resolveMountedActivationProjection(screenPoint) {
    return resolveActivationProjection(resolveMountedProjectionContext(screenPoint));
  }

  function resolveMountedPointerMoveProjection(screenPoint, { pointer = null } = {}) {
    return resolvePointerMoveProjection({
      ...resolveMountedProjectionContext(screenPoint),
      pointer,
    });
  }

  function resolveMountedPointerLeaveProjection() {
    return resolvePointerMoveProjection(resolveBaseProjectionContext());
  }

  function resolveMountedPointerSequenceProjection(screenPoint, { pointer = null } = {}) {
    return resolvePointerSequenceProjection({
      ...resolveMountedProjectionContext(screenPoint),
      pointer,
    });
  }

  function resolveMountedWheelProjection(screenPoint, { wheel = null } = {}) {
    return resolveWheelProjection({
      ...resolveMountedProjectionContext(screenPoint),
      wheel,
    });
  }

  function resolveMountedProjectionContext(screenPoint) {
    const context = getOverlayInputContext();
    return {
      machineState: context.machineState,
      runtime: context.runtime,
      isPointerOverOverlay: isScreenPointOverOverlayViewModel({
        viewModel: context.viewModel,
        screenPoint,
      }),
    };
  }

  function resolveBaseProjectionContext() {
    const context = getOverlayInputContext();
    return {
      machineState: context.machineState,
      runtime: context.runtime,
    };
  }
}
