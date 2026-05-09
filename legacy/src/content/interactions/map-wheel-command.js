import {
  resolveOverlayRenderSource,
} from "../../core/overlay-render.js";

export function createMapWheelCommand({
  mapGesture,
  getMachineState,
  logger,
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
      logger.warn("Map zoom requested, but the map gesture port could not forward it");
      return false;
    }
    logger.info("Forwarded native wheel to map zoom; overlay follows through the current render state", {
      forwarded,
      deltaY,
      renderSource: resolveOverlayRenderSource(getMachineState().session),
    });
    return true;
  }
}
