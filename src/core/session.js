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
  const placementCandidate = session.placement ?? createLegacyPlacement(session.fit);
  return {
    mode: normalizeSessionMode(session.mode),
    opacity: normalizeSessionOpacity(session.opacity),
    image: normalizeSessionImage(session.image),
    placement: normalizePlacement(placementCandidate),
    registration: normalizeRegistration(session.registration),
  };
}

export function normalizeSessionMode(mode) {
  return isKnownSessionMode(mode) ? mode : DEFAULT_SESSION_MODE;
}

export function isKnownSessionMode(mode) {
  return Object.values(SESSION_MODE).includes(mode);
}

export function nextSessionMode(mode) {
  return isAlignMode(mode) ? SESSION_MODE.TRACE : SESSION_MODE.ALIGN;
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

export function createInvalidatedRegistration(registration) {
  return createDirtyRegistration(registration, { clearSolvedTransform: true });
}

export function createPlacementEditedRegistration(registration) {
  return createDirtyRegistration(registration, { clearSolvedTransform: false });
}

export function hasOverlayImageSession(session) {
  return Boolean(session?.image);
}

export function getOverlayImage(session) {
  return hasOverlayImageSession(session) ? session.image : null;
}

export function hasCleanSolvedTransform(registration) {
  return resolveRegistrationSolveState(registration).kind === "solved";
}

export function getRegistrationPinCount(registration) {
  return getRegistrationPins(registration).length;
}

export function getRegistrationPins(registration) {
  return Array.isArray(registration?.pins) ? registration.pins : [];
}

export function resolveRegistrationPinMutation(previousRegistration, nextRegistration) {
  const previousPins = getRegistrationPins(previousRegistration);
  const nextPins = getRegistrationPins(nextRegistration);
  const previousIds = new Set(previousPins.map((pin) => pin.id));
  const nextIds = new Set(nextPins.map((pin) => pin.id));
  return {
    addedPin: nextPins.find((pin) => !previousIds.has(pin.id)) ?? null,
    removedPinIds: previousPins
      .filter((pin) => !nextIds.has(pin.id))
      .map((pin) => pin.id),
  };
}

export function canSolveRegistration(registration) {
  return resolveRegistrationSolveState(registration).canCompute;
}

export function needsSolveRecompute(registration) {
  return resolveRegistrationSolveState(registration).kind === "dirty";
}

export function didRegistrationChange(previousRegistration, nextRegistration) {
  return !registrationsEqual(previousRegistration, nextRegistration);
}

export function resolveRegistrationSolveState(registration) {
  const pinCount = getRegistrationPinCount(registration);
  const hasSolvedTransform = Boolean(registration?.solvedTransform);
  const isDirty = Boolean(registration?.dirty);
  const solvedPinCount = Number.isFinite(registration?.solvedTransform?.pinCount)
    ? registration.solvedTransform.pinCount
    : pinCount;
  if (hasSolvedTransform && !isDirty) {
    return {
      kind: "solved",
      pinCount,
      solvedPinCount,
      canCompute: true,
    };
  }
  if (pinCount >= 2 && isDirty) {
    return {
      kind: "dirty",
      pinCount,
      solvedPinCount,
      canCompute: true,
    };
  }
  if (pinCount >= 2) {
    return {
      kind: "ready",
      pinCount,
      solvedPinCount,
      canCompute: true,
    };
  }
  if (pinCount > 0) {
    return {
      kind: "insufficient-pins",
      pinCount,
      solvedPinCount,
      canCompute: false,
    };
  }
  return {
    kind: "empty",
    pinCount: 0,
    solvedPinCount: 0,
    canCompute: false,
  };
}

function createDirtyRegistration(registration, { clearSolvedTransform }) {
  const pins = normalizePins(registration?.pins);
  return normalizeRegistration({
    pins,
    solvedTransform: clearSolvedTransform ? null : registration?.solvedTransform ?? null,
    dirty: pins.length > 0,
  });
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

function createLegacyPlacement(legacyFit) {
  if (!legacyFit || legacyFit.type !== "similarity") {
    return null;
  }
  return normalizeSimilarityTransform(legacyFit);
}

function placementsEqual(left, right) {
  return (
    left?.type === right?.type &&
    left?.a === right?.a &&
    left?.b === right?.b &&
    left?.tx === right?.tx &&
    left?.ty === right?.ty
  );
}

function registrationsEqual(left, right) {
  if (left?.dirty !== right?.dirty) {
    return false;
  }
  if (!placementsEqual(left?.solvedTransform ?? null, right?.solvedTransform ?? null)) {
    return false;
  }
  const leftPins = getRegistrationPins(left);
  const rightPins = getRegistrationPins(right);
  if (leftPins.length !== rightPins.length) {
    return false;
  }
  return leftPins.every((leftPin, index) => pinsEqual(leftPin, rightPins[index]));
}

function pinsEqual(left, right) {
  return (
    left?.id === right?.id &&
    left?.imagePx?.x === right?.imagePx?.x &&
    left?.imagePx?.y === right?.imagePx?.y &&
    left?.mapLatLon?.lat === right?.mapLatLon?.lat &&
    left?.mapLatLon?.lon === right?.mapLatLon?.lon
  );
}
