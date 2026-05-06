import {
  resolveOverlayRenderSource,
} from "../../core/transform.js";
import {
  createHandledWheelOutcome,
  createUnhandledWheelOutcome,
} from "./wheel-outcome.js";

export function createMapWheelCommand({
  mapGesture,
  getMachineState,
}) {
  return {
    handleMapZoomWheel,
  };

  function handleMapZoomWheel({ deltaY, screenPoint }) {
    const forwarded = mapGesture.forwardMapZoom({
      screenPoint,
      deltaY,
    });
    if (!forwarded) {
      return createUnhandledWheelOutcome("map-zoom-not-forwarded", {
        log: {
          level: "warn",
          message: "Map zoom requested, but the map gesture port could not forward it",
        },
      });
    }
    return createHandledWheelOutcome({
      pointerScreenPx: screenPoint,
      log: {
        level: "info",
        message: "Forwarded native wheel to map zoom; overlay follows through the current render state",
        details: {
          forwarded,
          deltaY,
          renderSource: resolveOverlayRenderSource(getMachineState().session),
        },
      },
    });
  }
}
