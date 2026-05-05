import { MACHINE_EVENT_KIND } from "../../core/machine/events.js";
import { getOverlayImage, hasOverlayImageSession } from "../../core/session.js";
import {
  buildPinRenderModels,
  derivePlacementFromCurrentRenderState,
  hitTestPin,
  imagePointToRenderedScreenPoint,
  isImagePointWithinBounds,
  resolveOverlayScreenTransform,
  screenPointToRenderedImagePoint,
} from "../../core/transform.js";

export function createPinToggleCommand({
  pageAdapter,
  getMachineState,
  dispatchMachine,
}) {
  // TODO(smell): Pin toggling still assembles render projection, hit testing,
  // map coordinate lookup, and the machine event in one content command. The
  // final seam should pass already-projected intent facts into the machine.
  return {
    toggleAtScreenPoint,
  };

  function toggleAtScreenPoint(screenPoint) {
    const machineState = getMachineState();
    const snapshot = pageAdapter.getSnapshot();
    const pinContext = resolvePinContext({
      state: machineState.session,
      snapshot,
      screenPoint,
      pageAdapter,
    });
    if (!pinContext.ok) {
      return {
        handled: false,
        reason: pinContext.reason,
      };
    }

    const preservedPlacement = derivePlacementFromCurrentRenderState({
      state: machineState,
      snapshot,
    });
    const result = dispatchMachine({
      type: MACHINE_EVENT_KIND.TOGGLE_PIN,
      imagePx: pinContext.imagePx,
      mapLatLon: pinContext.mapLatLon,
      existingPinId: pinContext.existingPin?.id ?? null,
      ...(preservedPlacement ? { preservedPlacement } : {}),
    });
    const handled = Boolean(result.historyRecord);
    return {
      handled,
      reason: handled ? null : "machine-rejected",
      pointerScreenPx: pinContext.pointerScreenPx,
      existingPinId: pinContext.existingPin?.id ?? null,
    };
  }
}

function resolvePinContext({ state, snapshot, screenPoint, pageAdapter }) {
  if (!hasOverlayImageSession(state)) {
    return createPinContextFailure("no-image");
  }
  const pointerScreenPx = screenPoint;
  if (!pointerScreenPx) {
    return createPinContextFailure("no-pointer");
  }

  const currentTransform = resolveOverlayScreenTransform({
    state,
    snapshot,
  });
  const imagePx = screenPointToRenderedImagePoint({
    screenPoint: pointerScreenPx,
    transform: currentTransform,
    snapshot,
  });
  const image = getOverlayImage(state);
  if (!isImagePointWithinBounds(imagePx, image)) {
    return createPinContextFailure("pointer-outside-image");
  }

  const renderedPins = buildPinRenderModels({
    pins: state.registration.pins,
    transform: currentTransform,
    projectOverlayScreenPoint: (pinImagePx) => imagePointToRenderedScreenPoint({
      imagePoint: pinImagePx,
      transform: currentTransform,
      snapshot,
    }),
  });
  const existingPin = hitTestPin({
    screenPoint: pointerScreenPx,
    renderedPins,
  });

  return {
    ok: true,
    pointerScreenPx,
    imagePx,
    mapLatLon: pageAdapter.screenToMap(pointerScreenPx),
    existingPin,
  };
}

function createPinContextFailure(reason) {
  return {
    ok: false,
    reason,
  };
}
