import {
  planPinToggleAtScreenPoint,
} from "./pin-toggle-planning.js";

export function createPinToggleCommand({
  pageObservation,
  pageProjection,
  getMachineState,
  machineActions,
}) {
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
      return {
        handled: false,
        reason: pinPlan.reason,
      };
    }

    const result = machineActions.togglePin({
      imagePx: pinPlan.imagePx,
      mapLatLon: pinPlan.mapLatLon,
      existingPinId: pinPlan.existingPinId,
      ...(pinPlan.preservedPlacement ? { preservedPlacement: pinPlan.preservedPlacement } : {}),
    });
    const handled = Boolean(result.historyRecord);
    return {
      handled,
      reason: handled ? null : "machine-rejected",
      pointerScreenPx: pinPlan.pointerScreenPx,
      existingPinId: pinPlan.existingPinId,
    };
  }
}
