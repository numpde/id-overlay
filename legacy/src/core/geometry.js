const TILE_SIZE = 256;

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
  return createSimilarityTransform({
    a,
    b,
    tx: worldCentroid.x - a * imageCentroid.x + b * imageCentroid.y,
    ty: worldCentroid.y - b * imageCentroid.x - a * imageCentroid.y,
    pinCount: pins.length,
  });
}

export function createSimilarityTransform({ a, b, tx, ty, pinCount = undefined }) {
  return {
    type: "similarity",
    a,
    b,
    tx,
    ty,
    scale: Math.hypot(a, b),
    rotationRad: Math.atan2(b, a),
    ...(pinCount === undefined ? {} : { pinCount }),
  };
}

export function projectLatLonToWorld(point) {
  const sinLat = Math.sin((point.lat * Math.PI) / 180);
  const clampedSin = Math.min(0.9999, Math.max(-0.9999, sinLat));
  return {
    x: TILE_SIZE * ((point.lon + 180) / 360),
    y: TILE_SIZE * (0.5 - Math.log((1 + clampedSin) / (1 - clampedSin)) / (4 * Math.PI)),
  };
}

export function unprojectWorldToLatLon(point) {
  const lon = (point.x / TILE_SIZE) * 360 - 180;
  const mercatorY = (0.5 - point.y / TILE_SIZE) * 2 * Math.PI;
  const lat = (Math.atan(Math.sinh(mercatorY)) * 180) / Math.PI;
  return { lat, lon };
}

function averagePoint(points) {
  const sums = points.reduce(
    (accumulator, point) => ({
      x: accumulator.x + point.x,
      y: accumulator.y + point.y,
    }),
    { x: 0, y: 0 },
  );
  return {
    x: sums.x / points.length,
    y: sums.y / points.length,
  };
}

function subtractPoints(left, right) {
  return {
    x: left.x - right.x,
    y: left.y - right.y,
  };
}
