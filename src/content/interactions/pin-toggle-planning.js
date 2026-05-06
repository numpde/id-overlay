import { getOverlayImage, hasOverlayImageSession } from "../../core/session.js";
import {
  imagePointToRenderedScreenPoint,
  isImagePointWithinBounds,
  screenPointToRenderedImagePoint,
} from "../../core/transform.js";
import {
  derivePlacementFromCurrentRenderState,
  resolveOverlayScreenTransform,
} from "../../core/overlay-render.js";
import {
  buildPinRenderModels,
  hitTestPin,
} from "../../core/pin-render.js";

export function planPinToggleAtScreenPoint({
  machineState,
  snapshot,
  screenPoint,
  screenToMap,
}) {
  const session = machineState?.session ?? machineState;
  if (!hasOverlayImageSession(session)) {
    return createPinTogglePlanFailure("no-image");
  }
  if (!screenPoint) {
    return createPinTogglePlanFailure("no-pointer");
  }

  const currentTransform = resolveOverlayScreenTransform({
    state: session,
    snapshot,
  });
  const imagePx = screenPointToRenderedImagePoint({
    screenPoint,
    transform: currentTransform,
    snapshot,
  });
  const image = getOverlayImage(session);
  if (!isImagePointWithinBounds(imagePx, image)) {
    return createPinTogglePlanFailure("pointer-outside-image");
  }

  const existingPin = resolveExistingPin({
    session,
    snapshot,
    screenPoint,
    transform: currentTransform,
  });
  const preservedPlacement = derivePlacementFromCurrentRenderState({
    state: machineState,
    snapshot,
  });

  return {
    ok: true,
    pointerScreenPx: screenPoint,
    imagePx,
    mapLatLon: screenToMap(screenPoint),
    existingPinId: existingPin?.id ?? null,
    preservedPlacement,
  };
}

function resolveExistingPin({
  session,
  snapshot,
  screenPoint,
  transform,
}) {
  const renderedPins = buildPinRenderModels({
    pins: session.registration.pins,
    transform,
    projectOverlayScreenPoint: (pinImagePx) => imagePointToRenderedScreenPoint({
      imagePoint: pinImagePx,
      transform,
      snapshot,
    }),
  });
  return hitTestPin({
    screenPoint,
    renderedPins,
  });
}

function createPinTogglePlanFailure(reason) {
  return {
    ok: false,
    reason,
  };
}
