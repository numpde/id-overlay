import {
  MACHINE_EVENT_KIND,
  MACHINE_PLACEMENT_EDIT_KIND,
} from "./machine/events.js";
import {
  createPlacementEditedRegistration,
  getOverlayImage,
} from "./session.js";
import {
  createSimilarityTransformFromAnchor,
  derivePlacementFromCurrentRenderState,
  derivePlacementFromScreenTransform,
  imagePointToRenderedScreenPoint,
  isImagePointWithinBounds,
  removeSurfaceMotionFromScreenPoint,
  resolveOverlayScreenTransform,
  rotationFromWheelDelta,
  scaleFromWheelDelta,
  screenPointToRenderedImagePoint,
} from "./transform.js";

// TODO(smell): The planner currently returns machine event payloads as well as
// pure placement calculations. Keep this boundary small; the next cleanup is to
// split event construction from edit math when geometry gets a second caller.
export function resolvePlacementEditRenderState({ state, snapshot }) {
  const session = state?.session ?? state;
  const runtime = state?.session ? state.runtime ?? null : null;
  if (!session) {
    return null;
  }
  const placement = runtime?.placementEdit?.previewPlacement ??
    derivePlacementFromCurrentRenderState({ state, snapshot }) ??
    session.placement;
  if (placement?.type !== "similarity") {
    return null;
  }
  return {
    ...session,
    placement,
    registration: createPlacementEditedRegistration(session.registration),
  };
}

export function planMovePlacementEditStart({
  state,
  snapshot,
  startPointerScreenPx,
}) {
  // TODO(smell): This planner needs machine state to construct a transition
  // event. In the final boundary it should be pure geometry over render facts,
  // with edit lifecycle interpretation performed inside the machine.
  const editState = resolvePlacementEditRenderState({ state, snapshot });
  if (!editState || !isScreenPoint(startPointerScreenPx)) {
    return null;
  }
  const startCenterScreenPx = resolveOverlayCenterScreenPoint({
    state: editState,
    snapshot,
  });
  return {
    startPointerScreenPx,
    startCenterScreenPx,
    event: {
      type: MACHINE_EVENT_KIND.BEGIN_PLACEMENT_EDIT,
      editKind: MACHINE_PLACEMENT_EDIT_KIND.MOVE,
      renderedPlacement: editState.placement,
    },
  };
}

export function planMovePlacementEditPreview({
  state,
  snapshot,
  startPointerScreenPx,
  startCenterScreenPx,
  pointerScreenPx,
}) {
  const editState = resolvePlacementEditRenderState({ state, snapshot });
  if (
    !editState ||
    !isScreenPoint(startPointerScreenPx) ||
    !isScreenPoint(startCenterScreenPx) ||
    !isScreenPoint(pointerScreenPx)
  ) {
    return null;
  }
  const nextCenterScreenPx = {
    x: startCenterScreenPx.x + (pointerScreenPx.x - startPointerScreenPx.x),
    y: startCenterScreenPx.y + (pointerScreenPx.y - startPointerScreenPx.y),
  };
  return {
    event: {
      type: MACHINE_EVENT_KIND.PREVIEW_PLACEMENT_EDIT,
      placement: createRetunedPlacementTransform({
        state: editState,
        snapshot,
        centerScreenPx: nextCenterScreenPx,
      }),
    },
  };
}

export function planRotatePlacementEdit({
  state,
  snapshot,
  anchorScreenPx,
  deltaY,
}) {
  // TODO(smell): Wheel rotation planning returns a durable mutation event. Keep
  // anchor/transform math here, but move the user-rotation transition decision
  // and history/status creation into machine ingress handling.
  const editState = resolvePlacementEditRenderState({ state, snapshot });
  if (!editState) {
    return null;
  }
  const rotationRad = rotationFromWheelDelta(editState.placement.rotationRad, deltaY);
  const placement = createRetunedPlacementTransform({
    state: editState,
    snapshot,
    anchorScreenPx,
    rotationRad,
  });
  return {
    rotationRad,
    event: {
      type: MACHINE_EVENT_KIND.APPLY_PLACEMENT_EDIT,
      renderedPlacement: editState.placement,
      placement,
      editKind: MACHINE_PLACEMENT_EDIT_KIND.ROTATE,
    },
  };
}

export function planScalePlacementEdit({
  state,
  snapshot,
  anchorScreenPx,
  deltaY,
}) {
  // TODO(smell): Wheel scale planning returns a durable mutation event. Keep
  // anchor/transform math here, but move the user-scale transition decision and
  // history/status creation into machine ingress handling.
  const editState = resolvePlacementEditRenderState({ state, snapshot });
  if (!editState) {
    return null;
  }
  const screenScale = Math.hypot(
    editState.placement.a,
    editState.placement.b,
  ) * (2 ** snapshot.mapView.zoom);
  const scale = scaleFromWheelDelta(screenScale, deltaY);
  const placement = createRetunedPlacementTransform({
    state: editState,
    snapshot,
    anchorScreenPx,
    screenScale: scale,
  });
  return {
    scale,
    event: {
      type: MACHINE_EVENT_KIND.APPLY_PLACEMENT_EDIT,
      renderedPlacement: editState.placement,
      placement,
      editKind: MACHINE_PLACEMENT_EDIT_KIND.SCALE,
    },
  };
}

function createRetunedPlacementTransform({
  state,
  snapshot,
  centerScreenPx = null,
  anchorScreenPx = null,
  screenScale = null,
  rotationRad = null,
}) {
  const image = getOverlayImage(state);
  const screenTransform = resolveOverlayScreenTransform({
    state,
    snapshot,
  });
  const imageCenter = {
    x: image.width / 2,
    y: image.height / 2,
  };
  const resolvedScreenScale = screenScale ?? Math.hypot(screenTransform.a, screenTransform.b);
  const resolvedRotationRad = rotationRad ?? Math.atan2(screenTransform.b, screenTransform.a);
  const anchorImagePx = anchorScreenPx
    ? screenPointToRenderedImagePoint({
      screenPoint: anchorScreenPx,
      transform: screenTransform,
      snapshot,
    })
    : null;

  if (
    anchorImagePx &&
    isImagePointWithinBounds(anchorImagePx, image)
  ) {
    return derivePlacementFromScreenTransform({
      snapshot,
      transform: createSimilarityTransformFromAnchor({
        anchorImagePx,
        anchorTargetPx: removeSurfaceMotionFromScreenPoint({
          screenPoint: anchorScreenPx,
          snapshot,
        }),
        scale: resolvedScreenScale,
        rotationRad: resolvedRotationRad,
      }),
    });
  }

  const resolvedCenterScreenPx = centerScreenPx ?? resolveOverlayCenterScreenPoint({
    state,
    snapshot,
  });
  return derivePlacementFromScreenTransform({
    snapshot,
    transform: createSimilarityTransformFromAnchor({
      anchorImagePx: imageCenter,
      anchorTargetPx: removeSurfaceMotionFromScreenPoint({
        screenPoint: resolvedCenterScreenPx,
        snapshot,
      }),
      scale: resolvedScreenScale,
      rotationRad: resolvedRotationRad,
    }),
  });
}

function resolveOverlayCenterScreenPoint({ state, snapshot }) {
  const image = getOverlayImage(state);
  const screenTransform = resolveOverlayScreenTransform({
    state,
    snapshot,
  });
  return imagePointToRenderedScreenPoint({
    imagePoint: {
      x: image.width / 2,
      y: image.height / 2,
    },
    transform: screenTransform,
    snapshot,
  });
}

function isScreenPoint(point) {
  return Number.isFinite(point?.x) && Number.isFinite(point?.y);
}
