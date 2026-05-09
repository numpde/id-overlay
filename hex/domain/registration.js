export function solveRegistrationPlacement({ pins }) {
  if (pins.length < 2) {
    return {
      kind: "failed",
      reason: "insufficient-pins",
    };
  }

  const [firstPin, secondPin] = pins;
  const imageVector = vectorBetween(firstPin.imagePx, secondPin.imagePx);
  const mapVector = vectorBetween(firstPin.mapPx, secondPin.mapPx);
  const imageLength = vectorLength(imageVector);
  const mapLength = vectorLength(mapVector);
  if (imageLength === 0 || mapLength === 0) {
    return {
      kind: "failed",
      reason: "degenerate-pins",
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
    placement: {
      x: firstPin.mapPx.x - transformedFirst.x,
      y: firstPin.mapPx.y - transformedFirst.y,
      scale,
      rotationRad,
    },
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
