import { DEFAULT_SESSION_OPACITY } from "./session.js";

export function clampOpacity(value) {
  if (!Number.isFinite(value)) {
    return DEFAULT_SESSION_OPACITY;
  }
  return Math.min(1, Math.max(0, value));
}

export function opacityFromWheelDelta(opacity, deltaY) {
  const nextOpacity = Number(opacity) - deltaY / 1000;
  return clampOpacity(nextOpacity);
}
