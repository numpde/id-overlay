import { clampScale } from "./transform.js";

const WHEEL_SCALE_STEP = 1 / 400;
const WHEEL_ROTATION_STEP = 1 / 800;

export function scaleFromWheelDelta(scale, deltaY) {
  const factor = Math.exp(-deltaY * WHEEL_SCALE_STEP);
  return clampScale(scale * factor);
}

export function rotationFromWheelDelta(rotationRad, deltaY) {
  return rotationRad - deltaY * WHEEL_ROTATION_STEP;
}
