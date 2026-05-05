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

export const PLACEMENT_EDIT_PLAN_PHASE = Object.freeze({
  BEGIN: "begin",
  PREVIEW: "preview",
  APPLY: "apply",
});

export const PLACEMENT_EDIT_PLAN_KIND = Object.freeze({
  MOVE: "move",
  ROTATE: "rotate",
  SCALE: "scale",
});

export function resolvePlacementEditRenderState({ machineState, snapshot }) {
  const session = machineState?.session ?? machineState;
  const runtime = machineState?.session ? machineState.runtime ?? null : null;
  if (!session) {
    return null;
  }
  const placement = runtime?.placementEdit?.previewPlacement ??
    derivePlacementFromCurrentRenderState({ state: session, snapshot }) ??
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
  machineState,
  snapshot,
  startPointerScreenPx,
}) {
  const editState = resolvePlacementEditRenderState({ machineState, snapshot });
  if (!editState || !isScreenPoint(startPointerScreenPx)) {
    return null;
  }
  const startCenterScreenPx = resolveOverlayCenterScreenPoint({
    editState,
    snapshot,
  });
  return {
    phase: PLACEMENT_EDIT_PLAN_PHASE.BEGIN,
    kind: PLACEMENT_EDIT_PLAN_KIND.MOVE,
    startPointerScreenPx,
    startCenterScreenPx,
    renderedPlacement: editState.placement,
  };
}

export function planMovePlacementEditPreview({
  machineState,
  snapshot,
  startPointerScreenPx,
  startCenterScreenPx,
  pointerScreenPx,
}) {
  const editState = resolvePlacementEditRenderState({ machineState, snapshot });
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
    phase: PLACEMENT_EDIT_PLAN_PHASE.PREVIEW,
    placement: createRetunedPlacementTransform({
      editState,
      snapshot,
      centerScreenPx: nextCenterScreenPx,
    }),
  };
}

export function planRotatePlacementEdit({
  machineState,
  snapshot,
  anchorScreenPx,
  deltaY,
}) {
  const editState = resolvePlacementEditRenderState({ machineState, snapshot });
  if (!editState) {
    return null;
  }
  const rotationRad = rotationFromWheelDelta(editState.placement.rotationRad, deltaY);
  const placement = createRetunedPlacementTransform({
    editState,
    snapshot,
    anchorScreenPx,
    rotationRad,
  });
  return {
    phase: PLACEMENT_EDIT_PLAN_PHASE.APPLY,
    kind: PLACEMENT_EDIT_PLAN_KIND.ROTATE,
    renderedPlacement: editState.placement,
    placement,
    rotationRad,
  };
}

export function planScalePlacementEdit({
  machineState,
  snapshot,
  anchorScreenPx,
  deltaY,
}) {
  const editState = resolvePlacementEditRenderState({ machineState, snapshot });
  if (!editState) {
    return null;
  }
  const screenScale = Math.hypot(
    editState.placement.a,
    editState.placement.b,
  ) * (2 ** snapshot.mapView.zoom);
  const scale = scaleFromWheelDelta(screenScale, deltaY);
  const placement = createRetunedPlacementTransform({
    editState,
    snapshot,
    anchorScreenPx,
    screenScale: scale,
  });
  return {
    phase: PLACEMENT_EDIT_PLAN_PHASE.APPLY,
    kind: PLACEMENT_EDIT_PLAN_KIND.SCALE,
    renderedPlacement: editState.placement,
    placement,
    scale,
  };
}

function createRetunedPlacementTransform({
  editState,
  snapshot,
  centerScreenPx = null,
  anchorScreenPx = null,
  screenScale = null,
  rotationRad = null,
}) {
  const image = getOverlayImage(editState);
  const screenTransform = resolveOverlayScreenTransform({
    state: editState,
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
    editState,
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

function resolveOverlayCenterScreenPoint({ editState, snapshot }) {
  const image = getOverlayImage(editState);
  const screenTransform = resolveOverlayScreenTransform({
    state: editState,
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
