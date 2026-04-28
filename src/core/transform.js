import { hasCleanSolvedTransform } from "./state.js";

const DEFAULT_OPACITY = 0.6;
const DEFAULT_SCALE = 1;
const DEFAULT_ROTATION_RAD = 0;
const MIN_SCALE = 0.1;
const MAX_SCALE = 12;
const WHEEL_SCALE_STEP = 1 / 400;
const WHEEL_ROTATION_STEP = 1 / 800;
const TILE_SIZE = 256;

export function clampOpacity(value) {
  if (!Number.isFinite(value)) {
    return DEFAULT_OPACITY;
  }
  return Math.min(1, Math.max(0, value));
}

export function clampScale(value) {
  if (!Number.isFinite(value)) {
    return DEFAULT_SCALE;
  }
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));
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

export function resolvePlacementCenterMapLatLon(snapshot, placement) {
  return placement?.centerMapLatLon ?? snapshot.mapView.center;
}

export function createPlacementScreenTransform({ image, placement, snapshot, mapToScreen }) {
  const centerScreenPx = mapToScreen(resolvePlacementCenterMapLatLon(snapshot, placement));
  return createSimilarityTransformFromCenter({
    image,
    centerScreenPx,
    scale: placement?.scale,
    rotationRad: placement?.rotationRad,
  });
}

export function derivePlacementFromScreenTransform({
  image,
  transform,
  screenToMap,
}) {
  const imageCenter = {
    x: image.width / 2,
    y: image.height / 2,
  };
  const centerScreenPx = imagePointToScreenPoint({
    imagePoint: imageCenter,
    transform,
  });
  return {
    centerMapLatLon: screenToMap(centerScreenPx),
    scale: Math.hypot(transform.a, transform.b),
    rotationRad: Math.atan2(transform.b, transform.a),
  };
}

export function createSolvedScreenTransform({ snapshot, solvedTransform }) {
  if (!solvedTransform || solvedTransform.type !== "similarity") {
    return null;
  }
  const viewportCenter = getViewportCenter(snapshot.viewportRect);
  const centerWorld = projectLatLonToWorld(snapshot.mapView.center);
  const zoomScale = 2 ** snapshot.mapView.zoom;
  return createSimilarityTransform({
    a: solvedTransform.a * zoomScale,
    b: solvedTransform.b * zoomScale,
    tx: viewportCenter.x + (solvedTransform.tx - centerWorld.x) * zoomScale,
    ty: viewportCenter.y + (solvedTransform.ty - centerWorld.y) * zoomScale,
  });
}

export function resolveOverlayScreenTransform({ state, snapshot, mapToScreen }) {
  if (!state.image) {
    return null;
  }

  if (resolveOverlayRenderSource(state) === "solved") {
    return createSolvedScreenTransform({
      snapshot,
      solvedTransform: state.registration.solvedTransform,
    });
  }

  return createPlacementScreenTransform({
    image: state.image,
    placement: state.placement,
    snapshot,
    mapToScreen,
  });
}

export function resolveOverlayRenderSource(state) {
  if (!state.image) {
    return "none";
  }
  if (hasCleanSolvedTransform(state.registration)) {
    return "solved";
  }
  return "placement";
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

export function buildPinRenderModels({ pins, transform }) {
  return pins.map((pin) => ({
    id: pin.id,
    imagePx: pin.imagePx,
    mapLatLon: pin.mapLatLon,
    screenPx: imagePointToScreenPoint({
      imagePoint: pin.imagePx,
      transform,
    }),
  }));
}

export function hitTestPin({ screenPoint, renderedPins, radiusPx = 12 }) {
  const radiusSquared = radiusPx * radiusPx;
  let bestMatch = null;

  for (const pin of renderedPins) {
    const dx = pin.screenPx.x - screenPoint.x;
    const dy = pin.screenPx.y - screenPoint.y;
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
    anchorScreenPx: centerScreenPx,
    scale: nextScale,
    rotationRad: nextRotationRad,
  });
}

export function createSimilarityTransformFromAnchor({
  anchorImagePx,
  anchorScreenPx,
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
    tx: anchorScreenPx.x - a * anchorImagePx.x + b * anchorImagePx.y,
    ty: anchorScreenPx.y - b * anchorImagePx.x - a * anchorImagePx.y,
  });
}

function createSimilarityTransform({ a, b, tx, ty }) {
  return { a, b, tx, ty };
}

function applySimilarityToPoint(point, transform) {
  return {
    x: transform.a * point.x - transform.b * point.y + transform.tx,
    y: transform.b * point.x + transform.a * point.y + transform.ty,
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
