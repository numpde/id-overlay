import { normalizeOverlayImageMetadata } from "./image-normalization.js";

export const SESSION_MODE = Object.freeze({
  ALIGN: "align",
  TRACE: "trace",
});

export const DEFAULT_SESSION_MODE = SESSION_MODE.TRACE;
export const DEFAULT_SESSION_OPACITY = 0.6;

export function createEmptySession(overrides = {}) {
  return normalizeSession({
    mode: DEFAULT_SESSION_MODE,
    opacity: DEFAULT_SESSION_OPACITY,
    image: null,
    placement: null,
    registration: createEmptyRegistration(),
    ...overrides,
  });
}

export function createEmptyRegistration() {
  return {
    pins: [],
    solvedTransform: null,
    dirty: false,
  };
}

export function normalizeSession(candidate = {}) {
  const session = candidate ?? {};
  return {
    mode: normalizeSessionMode(session.mode),
    opacity: normalizeSessionOpacity(session.opacity),
    image: normalizeSessionImage(session.image),
    placement: normalizePlacement(session.placement),
    registration: normalizeRegistration(session.registration),
  };
}

export function normalizeSessionMode(mode) {
  return isKnownSessionMode(mode) ? mode : DEFAULT_SESSION_MODE;
}

export function isKnownSessionMode(mode) {
  return Object.values(SESSION_MODE).includes(mode);
}

export function isAlignMode(mode) {
  return mode === SESSION_MODE.ALIGN;
}

export function isTraceMode(mode) {
  return mode === SESSION_MODE.TRACE;
}

export function normalizeSessionOpacity(opacity) {
  const number = Number(opacity);
  if (!Number.isFinite(number)) {
    return DEFAULT_SESSION_OPACITY;
  }
  return Math.min(1, Math.max(0, number));
}

export function normalizeSessionImage(image) {
  return normalizeOverlayImageMetadata(image);
}

export function normalizePlacement(placement) {
  return normalizeSimilarityTransform(placement);
}

export function normalizeRegistration(registration = {}) {
  const candidate = registration ?? {};
  const pins = normalizePins(candidate.pins);
  return {
    pins,
    solvedTransform: normalizeSimilarityTransform(candidate.solvedTransform),
    dirty: normalizeDirty(candidate.dirty, pins),
  };
}

export function hasOverlayImageSession(session) {
  return Boolean(session?.image);
}

export function getOverlayImage(session) {
  return hasOverlayImageSession(session) ? session.image : null;
}

function normalizeDirty(dirty, pins) {
  if (!pins.length) {
    return false;
  }
  return Boolean(dirty);
}

function normalizePins(candidatePins) {
  if (!Array.isArray(candidatePins)) {
    return [];
  }
  return candidatePins
    .map(normalizePin)
    .filter(Boolean)
    .sort((left, right) => left.id - right.id);
}

function normalizePin(candidate) {
  const id = normalizePinId(candidate?.id);
  const imagePx = normalizePoint(candidate?.imagePx);
  const mapLatLon = normalizeLatLon(candidate?.mapLatLon);
  if (id === null || !imagePx || !mapLatLon) {
    return null;
  }
  return {
    id,
    imagePx,
    mapLatLon,
  };
}

function normalizePinId(id) {
  const value = Number(id);
  if (!Number.isInteger(value) || value <= 0) {
    return null;
  }
  return value;
}

function normalizeSimilarityTransform(candidate) {
  if (!candidate || candidate.type !== "similarity") {
    return null;
  }
  const a = Number(candidate.a);
  const b = Number(candidate.b);
  const tx = Number(candidate.tx);
  const ty = Number(candidate.ty);
  if (![a, b, tx, ty].every(Number.isFinite)) {
    return null;
  }
  return {
    type: "similarity",
    a,
    b,
    tx,
    ty,
    scale: Number.isFinite(candidate.scale) ? Number(candidate.scale) : Math.hypot(a, b),
    rotationRad: Number.isFinite(candidate.rotationRad)
      ? Number(candidate.rotationRad)
      : Math.atan2(b, a),
    ...(Number.isInteger(candidate.pinCount) ? { pinCount: candidate.pinCount } : {}),
  };
}

function normalizeLatLon(point) {
  if (!point) {
    return null;
  }
  const lat = Number(point.lat);
  const lon = Number(point.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }
  return { lat, lon };
}

function normalizePoint(point) {
  if (!point) {
    return null;
  }
  const x = Number(point.x);
  const y = Number(point.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }
  return { x, y };
}
