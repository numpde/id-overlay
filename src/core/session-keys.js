import {
  normalizePlacement,
  normalizeRegistration,
  normalizeSession,
  normalizeSessionImage,
} from "./session.js";

export function placementsEqual(left, right) {
  return (
    left?.type === right?.type &&
    left?.a === right?.a &&
    left?.b === right?.b &&
    left?.tx === right?.tx &&
    left?.ty === right?.ty
  );
}

export function createOverlayImageSnapshotKey(image) {
  const normalized = normalizeSessionImage(image);
  if (!normalized) {
    return "image:null";
  }
  return [
    "image",
    encodeURIComponent(normalized.src),
    normalized.width,
    normalized.height,
    normalized.original.width,
    normalized.original.height,
    encodeURIComponent(normalized.working.src),
    normalized.working.width,
    normalized.working.height,
    normalized.working.scaleFromOriginal,
  ].join(":");
}

export function createPlacementSnapshotKey(placement) {
  const normalized = normalizePlacement(placement);
  if (!normalized) {
    return "placement:null";
  }
  return [
    "placement",
    normalized.type,
    normalized.a,
    normalized.b,
    normalized.tx,
    normalized.ty,
    normalized.scale,
    normalized.rotationRad,
    Number.isInteger(normalized.pinCount) ? normalized.pinCount : "",
  ].join(":");
}

export function createRegistrationSnapshotKey(registration) {
  const normalized = normalizeRegistration(registration);
  const pins = normalized.pins.map((pin) => {
    return [
      pin.id,
      pin.imagePx.x,
      pin.imagePx.y,
      pin.mapLatLon.lat,
      pin.mapLatLon.lon,
    ].join(",");
  }).join(";");
  return [
    "registration",
    normalized.dirty ? 1 : 0,
    createPlacementSnapshotKey(normalized.solvedTransform),
    pins,
  ].join(":");
}

export function createSessionSnapshotKey(session) {
  const normalized = normalizeSession(session);
  return [
    "session",
    normalized.mode,
    normalized.opacity,
    createOverlayImageSnapshotKey(normalized.image),
    createPlacementSnapshotKey(normalized.placement),
    createRegistrationSnapshotKey(normalized.registration),
  ].join("|");
}

export function sessionsEqual(left, right) {
  return createSessionSnapshotKey(left) === createSessionSnapshotKey(right);
}
