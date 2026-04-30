import { hasCleanSolvedTransform, hasOverlayImageSession } from "./state.js";

const DEFAULT_OPACITY = 0.6;
const DEFAULT_SCREEN_SCALE = 1;
const DEFAULT_ROTATION_RAD = 0;
const MIN_SCREEN_SCALE = 0.1;
const MAX_SCREEN_SCALE = 12;
const WHEEL_SCALE_STEP = 1 / 400;
const WHEEL_ROTATION_STEP = 1 / 800;
const TILE_SIZE = 256;

export function clampOpacity(value) {
  if (!Number.isFinite(value)) {
    return DEFAULT_OPACITY;
  }
  return Math.min(1, Math.max(0, value));
}

export function opacityFromWheelDelta(opacity, deltaY) {
  const nextOpacity = Number(opacity) - deltaY / 1000;
  return clampOpacity(nextOpacity);
}

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

export function scaleFromWheelDelta(scale, deltaY) {
  const factor = Math.exp(-deltaY * WHEEL_SCALE_STEP);
  return clampScale(scale * factor);
}

export function rotationFromWheelDelta(rotationRad, deltaY) {
  return rotationRad - deltaY * WHEEL_ROTATION_STEP;
}

export function rotateVector(vector, rotationRad) {
  const cos = Math.cos(rotationRad);
  const sin = Math.sin(rotationRad);
  return {
    x: vector.x * cos - vector.y * sin,
    y: vector.x * sin + vector.y * cos,
  };
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

export function resolveOverlayRenderState(state) {
  if (!hasOverlayImageSession(state)) {
    return {
      source: "none",
      similarityTransform: null,
    };
  }
  if (hasCleanSolvedTransform(state.registration)) {
    return {
      source: "solved",
      similarityTransform: state.registration.solvedTransform,
    };
  }
  return {
    source: "placement",
    similarityTransform: state.placement,
  };
}

export function resolveOverlayScreenTransform({ state, snapshot }) {
  const renderState = resolveOverlayRenderState(state);
  if (!renderState.similarityTransform) {
    return null;
  }

  if (renderState.source === "solved") {
    return createSolvedScreenTransform({
      snapshot,
      solvedTransform: renderState.similarityTransform,
    });
  }

  return createPlacementScreenTransform({
    placement: renderState.similarityTransform,
    snapshot,
  });
}

export function resolveOverlayRenderSource(state) {
  return resolveOverlayRenderState(state).source;
}

export function buildOverlayRenderModel({ image, transform, opacity }) {
  const scale = Math.hypot(transform.a, transform.b);
  const rotationRad = Math.atan2(transform.b, transform.a);
  return {
    left: transform.tx,
    top: transform.ty,
    width: image.width * scale,
    height: image.height * scale,
    scale,
    rotationRad,
    rotationDeg: (rotationRad * 180) / Math.PI,
    opacity: clampOpacity(opacity),
  };
}

export function buildPinRenderModels({
  pins,
  transform = null,
  projectOverlayScreenPoint = (imagePoint) => imagePointToScreenPoint({ imagePoint, transform }),
  projectMapScreenPoint = null,
}) {
  return pins.map((pin) => ({
    id: pin.id,
    imagePx: pin.imagePx,
    mapLatLon: pin.mapLatLon,
    overlayScreenPx: projectOverlayScreenPoint(pin.imagePx, pin),
    mapScreenPx: projectMapScreenPoint?.(pin.mapLatLon, pin) ?? null,
  }));
}

export function hitTestPin({
  screenPoint,
  renderedPins,
  radiusPx = 12,
  resolveTargetScreenPoint = (pin) => pin.overlayScreenPx,
}) {
  const radiusSquared = radiusPx * radiusPx;
  let bestMatch = null;

  for (const pin of renderedPins) {
    const targetScreenPoint = resolveTargetScreenPoint(pin);
    if (!targetScreenPoint) {
      continue;
    }
    const dx = targetScreenPoint.x - screenPoint.x;
    const dy = targetScreenPoint.y - screenPoint.y;
    const distanceSquared = dx * dx + dy * dy;
    if (distanceSquared > radiusSquared) {
      continue;
    }
    if (!bestMatch || distanceSquared < bestMatch.distanceSquared) {
      bestMatch = {
        pin,
        distanceSquared,
      };
    }
  }

  return bestMatch?.pin ?? null;
}

export function solveSimilarityTransform(pins) {
  if (!Array.isArray(pins) || pins.length < 2) {
    return null;
  }

  const samples = pins.map((pin) => ({
    imagePx: pin.imagePx,
    world: projectLatLonToWorld(pin.mapLatLon),
  }));
  const imageCentroid = averagePoint(samples.map((sample) => sample.imagePx));
  const worldCentroid = averagePoint(samples.map((sample) => sample.world));

  let numeratorA = 0;
  let numeratorB = 0;
  let denominator = 0;

  for (const sample of samples) {
    const imageDelta = subtractPoints(sample.imagePx, imageCentroid);
    const worldDelta = subtractPoints(sample.world, worldCentroid);
    numeratorA += worldDelta.x * imageDelta.x + worldDelta.y * imageDelta.y;
    numeratorB += worldDelta.y * imageDelta.x - worldDelta.x * imageDelta.y;
    denominator += imageDelta.x * imageDelta.x + imageDelta.y * imageDelta.y;
  }

  if (!Number.isFinite(denominator) || denominator <= 0) {
    return null;
  }

  const a = numeratorA / denominator;
  const b = numeratorB / denominator;
  const tx = worldCentroid.x - a * imageCentroid.x + b * imageCentroid.y;
  const ty = worldCentroid.y - b * imageCentroid.x - a * imageCentroid.y;
  return {
    type: "similarity",
    a,
    b,
    tx,
    ty,
    scale: Math.hypot(a, b),
    rotationRad: Math.atan2(b, a),
    pinCount: pins.length,
  };
}

export function projectLatLonToWorld(point) {
  const worldScale = TILE_SIZE;
  const sinLat = Math.sin((point.lat * Math.PI) / 180);
  const clampedSin = Math.min(0.9999, Math.max(-0.9999, sinLat));
  return {
    x: worldScale * ((point.lon + 180) / 360),
    y: worldScale * (0.5 - Math.log((1 + clampedSin) / (1 - clampedSin)) / (4 * Math.PI)),
  };
}

export function unprojectWorldToLatLon(point) {
  const lon = (point.x / TILE_SIZE) * 360 - 180;
  const mercatorY = (0.5 - point.y / TILE_SIZE) * 2 * Math.PI;
  const lat = (Math.atan(Math.sinh(mercatorY)) * 180) / Math.PI;
  return { lat, lon };
}

function createSimilarityTransformFromCenter({ image, centerScreenPx, scale, rotationRad }) {
  const nextScale = clampScale(scale);
  const nextRotationRad = Number.isFinite(rotationRad) ? rotationRad : DEFAULT_ROTATION_RAD;
  const imageCenter = {
    x: image.width / 2,
    y: image.height / 2,
  };
  return createSimilarityTransformFromAnchor({
    anchorImagePx: imageCenter,
    anchorTargetPx: centerScreenPx,
    scale: nextScale,
    rotationRad: nextRotationRad,
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

function createSimilarityTransform({ a, b, tx, ty }) {
  return {
    type: "similarity",
    a,
    b,
    tx,
    ty,
    scale: Math.hypot(a, b),
    rotationRad: Math.atan2(b, a),
  };
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

function averagePoint(points) {
  const count = points.length;
  const sums = points.reduce(
    (accumulator, point) => ({
      x: accumulator.x + point.x,
      y: accumulator.y + point.y,
    }),
    { x: 0, y: 0 },
  );
  return {
    x: sums.x / count,
    y: sums.y / count,
  };
}

function subtractPoints(left, right) {
  return {
    x: left.x - right.x,
    y: left.y - right.y,
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
