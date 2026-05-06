import {
  isKnownWheelMode,
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
import {
  createUnhandledWheelOutcome,
} from "./wheel-outcome.js";

export function createWheelCommand({
  pageObservation,
  mapGesture,
  getMachineState,
  machineActions,
}) {
  // TODO(smell): Wheel command dispatch is mode-keyed orchestration over three
  // command families. Keep wheel mode interpretation here for now, but the
  // final command boundary should make each wheel mode a directly registered
  // handler so adding a mode cannot require editing this branch chain.
  const mapWheelCommand = createMapWheelCommand({
    mapGesture,
    getMachineState,
  });
  const opacityWheelCommand = createOpacityWheelCommand({
    machineActions,
  });
  const placementWheelCommand = createPlacementWheelCommand({
    pageObservation,
    getMachineState,
    machineActions,
  });

  return {
    handleWheel,
  };

  function handleWheel({ deltaY, wheelMode, screenPoint }) {
    if (!isKnownWheelMode(wheelMode)) {
      return createUnhandledWheelOutcome("unknown-wheel-mode");
    }
    if (wheelMode === WHEEL_MODE.MAP_ZOOM) {
      return mapWheelCommand.handleMapZoomWheel({ deltaY, screenPoint });
    }
    if (wheelMode === WHEEL_MODE.ADJUST_OPACITY) {
      return opacityWheelCommand.handleOpacityWheel({ deltaY, screenPoint });
    }
    if (wheelMode === WHEEL_MODE.ROTATE_OVERLAY || wheelMode === WHEEL_MODE.ZOOM_OVERLAY) {
      return placementWheelCommand.handlePlacementWheel({ deltaY, wheelMode, screenPoint });
    }
    return createUnhandledWheelOutcome("unsupported-wheel-mode");
  }
}
