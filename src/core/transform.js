import {
  createSimilarityTransform,
  projectLatLonToWorld,
  solveSimilarityTransform,
  unprojectWorldToLatLon,
} from "./geometry.js";

export {
  projectLatLonToWorld,
  solveSimilarityTransform,
  unprojectWorldToLatLon,
};

const DEFAULT_SCREEN_SCALE = 1;
const DEFAULT_ROTATION_RAD = 0;
const MIN_SCREEN_SCALE = 0.1;
const MAX_SCREEN_SCALE = 12;

export function clampScale(value) {
  if (!Number.isFinite(value)) {
    return DEFAULT_SCREEN_SCALE;
  }
  return Math.min(MAX_SCREEN_SCALE, Math.max(MIN_SCREEN_SCALE, value));
}

export function getViewportCenter(viewportRect) {
  return {
    x: viewportRect.left + viewportRect.width / 2,
    y: viewportRect.top + viewportRect.height / 2,
  };
}

export function imagePointToScreenPoint({ imagePoint, transform }) {
  return applySimilarityToPoint(imagePoint, transform);
}

export function screenPointToImagePoint({ screenPoint, transform }) {
  const determinant = transform.a * transform.a + transform.b * transform.b;
  if (determinant === 0) {
    return null;
  }

  const dx = screenPoint.x - transform.tx;
  const dy = screenPoint.y - transform.ty;
  return {
    x: (transform.a * dx + transform.b * dy) / determinant,
    y: (-transform.b * dx + transform.a * dy) / determinant,
  };
}

export function applySurfaceMotionToScreenPoint({ screenPoint, snapshot }) {
  const matrix = parseSurfaceMotionMatrix(snapshot?.surfaceMotion);
  if (!matrix) {
    return screenPoint;
  }
  const origin = parseSurfaceMotionOrigin(snapshot?.surfaceMotion);
  const localPoint = {
    x: screenPoint.x - snapshot.viewportRect.left,
    y: screenPoint.y - snapshot.viewportRect.top,
  };
  const transformedLocalPoint = applyMatrixToPoint(localPoint, matrix, origin);
  return {
    x: snapshot.viewportRect.left + transformedLocalPoint.x,
    y: snapshot.viewportRect.top + transformedLocalPoint.y,
  };
}

export function removeSurfaceMotionFromScreenPoint({ screenPoint, snapshot }) {
  const matrix = parseSurfaceMotionMatrix(snapshot?.surfaceMotion);
  if (!matrix) {
    return screenPoint;
  }
  const origin = parseSurfaceMotionOrigin(snapshot?.surfaceMotion);
  const localPoint = {
    x: screenPoint.x - snapshot.viewportRect.left,
    y: screenPoint.y - snapshot.viewportRect.top,
  };
  const transformedLocalPoint = invertMatrixPoint(localPoint, matrix, origin);
  return {
    x: snapshot.viewportRect.left + transformedLocalPoint.x,
    y: snapshot.viewportRect.top + transformedLocalPoint.y,
  };
}

export function imagePointToRenderedScreenPoint({ imagePoint, transform, snapshot }) {
  return applySurfaceMotionToScreenPoint({
    screenPoint: imagePointToScreenPoint({ imagePoint, transform }),
    snapshot,
  });
}

export function screenPointToRenderedImagePoint({ screenPoint, transform, snapshot }) {
  return screenPointToImagePoint({
    screenPoint: removeSurfaceMotionFromScreenPoint({ screenPoint, snapshot }),
    transform,
  });
}

export function isImagePointWithinBounds(imagePoint, image) {
  return (
    Number.isFinite(imagePoint?.x) &&
    Number.isFinite(imagePoint?.y) &&
    imagePoint.x >= 0 &&
    imagePoint.y >= 0 &&
    imagePoint.x <= image.width &&
    imagePoint.y <= image.height
  );
}

export function createPlacementTransform({
  image,
  centerMapLatLon,
  scale = DEFAULT_SCREEN_SCALE,
  rotationRad = DEFAULT_ROTATION_RAD,
  zoom,
}) {
  return createWorldSimilarityTransformFromPlacement({
    image,
    centerMapLatLon,
    scale,
    rotationRad,
    zoom,
  });
}

export function createPlacementScreenTransform({ snapshot, placement }) {
  return createWorldSimilarityScreenTransform({
    snapshot,
    similarityTransform: placement,
  });
}

export function derivePlacementFromScreenTransform({
  snapshot,
  transform,
}) {
  const viewportCenter = getViewportCenter(snapshot.viewportRect);
  const centerWorld = projectLatLonToWorld(snapshot.mapView.center);
  const zoomScale = 2 ** snapshot.mapView.zoom;
  return createSimilarityTransform({
    a: transform.a / zoomScale,
    b: transform.b / zoomScale,
    tx: centerWorld.x + (transform.tx - viewportCenter.x) / zoomScale,
    ty: centerWorld.y + (transform.ty - viewportCenter.y) / zoomScale,
  });
}

export function createSolvedScreenTransform({ snapshot, solvedTransform }) {
  return createWorldSimilarityScreenTransform({
    snapshot,
    similarityTransform: solvedTransform,
  });
}

export function createSimilarityTransformFromAnchor({
  anchorImagePx,
  anchorTargetPx,
  scale,
  rotationRad,
}) {
  const nextScale = clampScale(scale);
  const nextRotationRad = Number.isFinite(rotationRad) ? rotationRad : DEFAULT_ROTATION_RAD;
  const a = nextScale * Math.cos(nextRotationRad);
  const b = nextScale * Math.sin(nextRotationRad);
  return createSimilarityTransform({
    a,
    b,
    tx: anchorTargetPx.x - a * anchorImagePx.x + b * anchorImagePx.y,
    ty: anchorTargetPx.y - b * anchorImagePx.x - a * anchorImagePx.y,
  });
}

function applySimilarityToPoint(point, transform) {
  return {
    x: transform.a * point.x - transform.b * point.y + transform.tx,
    y: transform.b * point.x + transform.a * point.y + transform.ty,
  };
}

function applyMatrixToPoint(point, matrix, origin) {
  const translatedX = point.x - origin.x;
  const translatedY = point.y - origin.y;
  return {
    x: origin.x + matrix.a * translatedX + matrix.c * translatedY + matrix.e,
    y: origin.y + matrix.b * translatedX + matrix.d * translatedY + matrix.f,
  };
}

function invertMatrixPoint(point, matrix, origin) {
  const determinant = matrix.a * matrix.d - matrix.b * matrix.c;
  if (!Number.isFinite(determinant) || determinant === 0) {
    return point;
  }
  const translatedX = point.x - origin.x - matrix.e;
  const translatedY = point.y - origin.y - matrix.f;
  return {
    x: origin.x + ((matrix.d * translatedX) - (matrix.c * translatedY)) / determinant,
    y: origin.y + ((-matrix.b * translatedX) + (matrix.a * translatedY)) / determinant,
  };
}

function parseSurfaceMotionMatrix(surfaceMotion) {
  const transformCss = surfaceMotion?.transformCss;
  if (typeof transformCss !== "string" || transformCss === "none") {
    return null;
  }
  const matrixMatch = /matrix\(([^)]+)\)/.exec(transformCss);
  if (!matrixMatch) {
    return null;
  }
  const values = matrixMatch[1].split(",").map((value) => Number(value.trim()));
  if (values.length !== 6 || values.some((value) => !Number.isFinite(value))) {
    return null;
  }
  const [a, b, c, d, e, f] = values;
  return { a, b, c, d, e, f };
}

function parseSurfaceMotionOrigin(surfaceMotion) {
  const transformOriginCss = surfaceMotion?.transformOriginCss;
  if (typeof transformOriginCss !== "string") {
    return { x: 0, y: 0 };
  }
  const values = transformOriginCss
    .split(/\s+/)
    .slice(0, 2)
    .map((value) => Number.parseFloat(value));
  return {
    x: Number.isFinite(values[0]) ? values[0] : 0,
    y: Number.isFinite(values[1]) ? values[1] : 0,
  };
}

function createWorldSimilarityTransformFromPlacement({
  image,
  centerMapLatLon,
  scale,
  rotationRad,
  zoom,
}) {
  const centerWorld = projectLatLonToWorld(centerMapLatLon);
  const worldScale = clampScale(scale) / (2 ** zoom);
  return createWorldSimilarityTransformFromAnchor({
    anchorImagePx: {
      x: image.width / 2,
      y: image.height / 2,
    },
    anchorWorldPoint: centerWorld,
    scale: worldScale,
    rotationRad,
  });
}

function createWorldSimilarityTransformFromAnchor({
  anchorImagePx,
  anchorWorldPoint,
  scale,
  rotationRad,
}) {
  const nextRotationRad = Number.isFinite(rotationRad) ? rotationRad : DEFAULT_ROTATION_RAD;
  const a = scale * Math.cos(nextRotationRad);
  const b = scale * Math.sin(nextRotationRad);
  return createSimilarityTransform({
    a,
    b,
    tx: anchorWorldPoint.x - a * anchorImagePx.x + b * anchorImagePx.y,
    ty: anchorWorldPoint.y - b * anchorImagePx.x - a * anchorImagePx.y,
  });
}

function createWorldSimilarityScreenTransform({ snapshot, similarityTransform }) {
  if (!similarityTransform || similarityTransform.type !== "similarity") {
    return null;
  }
  const viewportCenter = getViewportCenter(snapshot.viewportRect);
  const centerWorld = projectLatLonToWorld(snapshot.mapView.center);
  const zoomScale = 2 ** snapshot.mapView.zoom;
  return createSimilarityTransform({
    a: similarityTransform.a * zoomScale,
    b: similarityTransform.b * zoomScale,
    tx: viewportCenter.x + (similarityTransform.tx - centerWorld.x) * zoomScale,
    ty: viewportCenter.y + (similarityTransform.ty - centerWorld.y) * zoomScale,
  });
}
