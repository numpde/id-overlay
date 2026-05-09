import {
  WHEEL_MODE,
} from "../../core/interaction-policy.js";
import {
  createMapWheelCommand,
} from "./map-wheel-command.js";
import {
  createOpacityWheelCommand,
} from "./opacity-wheel-command.js";
import {
  createPlacementWheelCommand,
} from "./placement-wheel-command.js";

export function createWheelCommand({
  pageObservation,
  mapGesture,
  getMachineState,
  machineActions,
  logger,
}) {
  const mapWheelCommand = createMapWheelCommand({
    mapGesture,
    getMachineState,
    logger,
  });
  const opacityWheelCommand = createOpacityWheelCommand({
    machineActions,
    logger,
  });
  const placementWheelCommand = createPlacementWheelCommand({
    pageObservation,
    getMachineState,
    machineActions,
    logger,
  });
  const wheelHandlers = Object.freeze({
    [WHEEL_MODE.MAP_ZOOM]: mapWheelCommand.handleMapZoomWheel,
    [WHEEL_MODE.ADJUST_OPACITY]: opacityWheelCommand.handleOpacityWheel,
    [WHEEL_MODE.ROTATE_OVERLAY]: placementWheelCommand.handlePlacementWheel,
    [WHEEL_MODE.ZOOM_OVERLAY]: placementWheelCommand.handlePlacementWheel,
  });

  return {
    handleWheel,
  };

  function handleWheel({ deltaY, wheelMode, screenPoint }) {
    return wheelHandlers[wheelMode]?.({ deltaY, wheelMode, screenPoint }) ?? false;
  }
}
