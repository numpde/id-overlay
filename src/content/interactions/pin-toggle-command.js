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
      return createUnhandledPinToggleOutcome(pinPlan.reason);
    }

    const result = machineActions.togglePin({
      imagePx: pinPlan.imagePx,
      mapLatLon: pinPlan.mapLatLon,
      existingPinId: pinPlan.existingPinId,
      ...(pinPlan.preservedPlacement ? { preservedPlacement: pinPlan.preservedPlacement } : {}),
    });
    const handled = Boolean(result.historyRecord);
    return handled
      ? createHandledPinToggleOutcome({
          pointerScreenPx: pinPlan.pointerScreenPx,
          existingPinId: pinPlan.existingPinId,
        })
      : createUnhandledPinToggleOutcome("machine-rejected");
  }
}

function createHandledPinToggleOutcome({ pointerScreenPx, existingPinId }) {
  return {
    handled: true,
    pointerScreenPx,
    log: {
      level: "info",
      message: "Toggled registration pin",
      details: {
        pinId: existingPinId,
      },
    },
  };
}

function createUnhandledPinToggleOutcome(reason) {
  return {
    handled: false,
    reason,
    log: {
      level: "warn",
      message: "Pin toggle requested without a valid pin context",
      details: {
        reason,
      },
    },
  };
}
