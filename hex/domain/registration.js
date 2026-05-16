export function solveRegistrationPlacement({ pins }) {
  if (pins.length < 2) {
    return {
      kind: "failed",
      reason: "insufficient-pins",
    };
  }

  const [firstPin, secondPin] = pins;
  const imageVector = vectorBetween(firstPin.imagePx, secondPin.imagePx);
  const firstWorld = projectLatLonToWorld(firstPin.mapLatLon);
  const secondWorld = projectLatLonToWorld(secondPin.mapLatLon);
  const mapVector = vectorBetween(firstWorld, secondWorld);
  const imageLength = vectorLength(imageVector);
  const mapLength = vectorLength(mapVector);
  if (imageLength === 0 || mapLength === 0) {
    return {
      kind: "failed",
      reason: "degenerate-pins",
      pinIds: [firstPin.id, secondPin.id],
    };
  }

  const scale = mapLength / imageLength;
  const rotationRad = Math.atan2(mapVector.y, mapVector.x)
    - Math.atan2(imageVector.y, imageVector.x);
  const cos = Math.cos(rotationRad);
  const sin = Math.sin(rotationRad);
  const transformedFirst = {
    x: firstPin.imagePx.x * scale * cos - firstPin.imagePx.y * scale * sin,
    y: firstPin.imagePx.x * scale * sin + firstPin.imagePx.y * scale * cos,
  };

  return {
    kind: "solved",
    solvedTransform: {
      type: "image-to-map-world",
      a: scale * cos,
      b: scale * sin,
      tx: firstWorld.x - transformedFirst.x,
      ty: firstWorld.y - transformedFirst.y,
      scale,
      rotationRad,
      pinIds: [firstPin.id, secondPin.id],
    },
  };
}

function projectLatLonToWorld(point) {
  const sinLat = Math.sin((point.lat * Math.PI) / 180);
  const clampedSin = Math.min(0.9999, Math.max(-0.9999, sinLat));
  return {
    x: 256 * ((point.lon + 180) / 360),
    y: 256 * (0.5 - Math.log((1 + clampedSin) / (1 - clampedSin)) / (4 * Math.PI)),
  };
}

function vectorBetween(start, end) {
  return {
    x: end.x - start.x,
    y: end.y - start.y,
  };
}

function vectorLength(vector) {
  return Math.hypot(vector.x, vector.y);
}
