import {
  getOverlayImage,
} from "./session.js";
import {
  createSimilarityTransformFromAnchor,
  derivePlacementFromScreenTransform,
  imagePointToRenderedScreenPoint,
  isImagePointWithinBounds,
  removeSurfaceMotionFromScreenPoint,
  screenPointToRenderedImagePoint,
} from "./transform.js";
import {
  resolveOverlayScreenTransform,
} from "./overlay-render.js";
import {
  rotationFromWheelDelta,
  scaleFromWheelDelta,
} from "./wheel-adjustment.js";

export function planMovePlacementEditStart({
  editContext,
  startPointerScreenPx,
}) {
  const editState = editContext?.editState;
  const snapshot = editContext?.snapshot;
  if (!editState || !isScreenPoint(startPointerScreenPx)) {
    return null;
  }
  const startCenterScreenPx = resolveOverlayCenterScreenPoint({
    editState,
    snapshot,
  });
  return {
    startPointerScreenPx,
    startCenterScreenPx,
    renderedPlacement: editState.placement,
  };
}

export function planMovePlacementEditPreview({
  editContext,
  startPointerScreenPx,
  startCenterScreenPx,
  pointerScreenPx,
}) {
  const editState = editContext?.editState;
  const snapshot = editContext?.snapshot;
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
    placement: createRetunedPlacementTransform({
      editContext,
      centerScreenPx: nextCenterScreenPx,
    }),
  };
}

export function planRotatePlacementEdit({
  editContext,
  anchorScreenPx,
  deltaY,
}) {
  const editState = editContext?.editState;
  if (!editState) {
    return null;
  }
  const rotationRad = rotationFromWheelDelta(editState.placement.rotationRad, deltaY);
  const placement = createRetunedPlacementTransform({
    editContext,
    anchorScreenPx,
    rotationRad,
  });
  return {
    renderedPlacement: editState.placement,
    placement,
    rotationRad,
  };
}

export function planScalePlacementEdit({
  editContext,
  anchorScreenPx,
  deltaY,
}) {
  const editState = editContext?.editState;
  const snapshot = editContext?.snapshot;
  if (!editState) {
    return null;
  }
  const screenScale = Math.hypot(
    editState.placement.a,
    editState.placement.b,
  ) * (2 ** snapshot.mapView.zoom);
  const scale = scaleFromWheelDelta(screenScale, deltaY);
  const placement = createRetunedPlacementTransform({
    editContext,
    anchorScreenPx,
    screenScale: scale,
  });
  return {
    renderedPlacement: editState.placement,
    placement,
    scale,
  };
}

function createRetunedPlacementTransform({
  editContext,
  centerScreenPx = null,
  anchorScreenPx = null,
  screenScale = null,
  rotationRad = null,
}) {
  const editState = editContext.editState;
  const snapshot = editContext.snapshot;
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
