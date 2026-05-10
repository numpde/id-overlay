import { isPlainData } from "./plain-data.js";

export function isPlacementData(value) {
  return isPlainData(value)
    && Number.isFinite(value.x)
    && Number.isFinite(value.y)
    && Number.isFinite(value.scale)
    && value.scale > 0
    && Number.isFinite(value.rotationRad);
}

export function placementEquals(left, right) {
  if (left === right) {
    return true;
  }
  if (!isPlacementData(left) || !isPlacementData(right)) {
    return false;
  }
  return left.x === right.x
    && left.y === right.y
    && left.scale === right.scale
    && left.rotationRad === right.rotationRad;
}
