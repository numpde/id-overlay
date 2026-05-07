import {
  planPinToggleAtScreenPoint,
} from "../../core/pin-toggle-planning.js";

export function createPinToggleInteraction({
  pageObservation,
  pageProjection,
  getMachineState,
  machineActions,
  runtimeBridge,
  errorBoundary,
  logger,
}) {
  return {
    toggleAtScreenPoint,
  };

  function toggleAtScreenPoint(screenPoint) {
    return errorBoundary.run("handle-toggle-pin", () => {
      runtimeBridge.observePointer(screenPoint);
      return commitPinToggleAtScreenPoint(screenPoint);
    }, { fallbackValue: false });
  }

  function commitPinToggleAtScreenPoint(screenPoint) {
    const machineState = getMachineState();
    const snapshot = pageObservation.getSnapshot();
    const pinPlan = planPinToggleAtScreenPoint({
      machineState,
      snapshot,
      screenPoint,
      screenToMap: (point) => pageProjection.screenToMap(point),
    });
    if (!pinPlan.ok) {
      logUnhandledPinToggle(pinPlan.reason);
      return false;
    }

    const result = machineActions.togglePin({
      imagePx: pinPlan.imagePx,
      mapLatLon: pinPlan.mapLatLon,
      existingPinId: pinPlan.existingPinId,
      ...(pinPlan.preservedPlacement ? { preservedPlacement: pinPlan.preservedPlacement } : {}),
    });
    if (!result.historyRecord) {
      logUnhandledPinToggle("machine-rejected");
      return false;
    }
    logger.info("Toggled registration pin", {
      pinId: pinPlan.existingPinId,
    });
    return true;
  }

  function logUnhandledPinToggle(reason) {
    logger.warn("Pin toggle requested without a valid pin context", {
      reason,
    });
  }
}
