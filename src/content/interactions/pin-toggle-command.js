import {
  planPinToggleAtScreenPoint,
} from "./pin-toggle-planning.js";

export function createPinToggleCommand({
  pageObservation,
  pageProjection,
  getMachineState,
  machineActions,
  logger,
}) {
  // TODO(smell): Pin toggle command still bundles page projection, machine
  // invocation, and user-facing logging. Keep planning as facts and let the
  // machine/result presenter author the semantic outcome description.
  return {
    toggleAtScreenPoint,
  };

  function toggleAtScreenPoint(screenPoint) {
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
    const handled = Boolean(result.historyRecord);
    if (!handled) {
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
