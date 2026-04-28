const DEFAULT_STATE = Object.freeze({
  mode: "trace",
  opacity: 0.6,
  image: null,
  placement: {
    centerMapLatLon: null,
    scale: 1,
    rotationRad: 0,
  },
  registration: {
    pins: [],
    solvedTransform: null,
    dirty: false,
  },
});

const DEFAULT_PLACEMENT = Object.freeze({ ...DEFAULT_STATE.placement });
const DEFAULT_REGISTRATION = Object.freeze({ ...DEFAULT_STATE.registration });

export function createStateStore(initialState = {}) {
  let state = normalizeState(initialState);
  const listeners = new Set();

  function getState() {
    return state;
  }

  function subscribe(listener, { emitCurrent = true } = {}) {
    listeners.add(listener);
    if (emitCurrent) {
      listener(state);
    }
    return () => listeners.delete(listener);
  }

  function setMode(mode) {
    replaceState({
      ...state,
      mode,
    });
  }

  function setOpacity(opacity) {
    replaceState({
      ...state,
      opacity,
    });
  }

  function loadImageSession(image, centerMapLatLon) {
    replaceState({
      ...state,
      mode: "align",
      image,
      placement: createImagePlacement({
        image,
        centerMapLatLon: centerMapLatLon ?? null,
      }),
      registration: createDefaultRegistration(),
    });
  }

  function setPlacement(nextPlacement) {
    const normalizedPlacement = normalizePlacement(nextPlacement);
    if (placementsEqual(normalizedPlacement, state.placement)) {
      return state;
    }
    replaceState({
      ...state,
      placement: normalizedPlacement,
      registration: createPlacementEditedRegistration(state.registration),
    });
  }

  function patchPlacement(partialPlacement) {
    const normalizedPlacement = normalizePlacement({
      ...state.placement,
      ...partialPlacement,
    });
    if (placementsEqual(normalizedPlacement, state.placement)) {
      return state;
    }
    replaceState({
      ...state,
      placement: normalizedPlacement,
      registration: createPlacementEditedRegistration(state.registration),
    });
  }

  function addPin({ imagePx, mapLatLon }) {
    const pin = normalizePin({
      id: getNextPinId(state.registration.pins),
      imagePx,
      mapLatLon,
    });
    if (!pin) {
      return null;
    }

    replaceState({
      ...state,
      registration: createInvalidatedRegistration({
        pins: [...state.registration.pins, pin],
      }),
    });
    return pin;
  }

  function removePin(pinId) {
    const nextPins = state.registration.pins.filter((pin) => pin.id !== pinId);
    if (nextPins.length === state.registration.pins.length) {
      return false;
    }

    replaceState({
      ...state,
      registration: createInvalidatedRegistration({
        pins: nextPins,
      }),
    });
    return true;
  }

  function clearPins() {
    replaceState({
      ...state,
      registration: createDefaultRegistration(),
    });
  }

  function setSolvedTransform(solvedTransform) {
    replaceState({
      ...state,
      registration: normalizeRegistration({
        ...state.registration,
        solvedTransform,
        dirty: false,
      }),
    });
  }

  function invalidateSolvedTransform() {
    replaceState({
      ...state,
      registration: createInvalidatedRegistration(state.registration),
    });
  }

  function clearImage() {
    replaceState({
      ...state,
      mode: "trace",
      image: null,
      placement: { ...DEFAULT_PLACEMENT },
      registration: createDefaultRegistration(),
    });
  }

  function replaceState(nextState) {
    state = normalizeState(nextState);
    notify();
    return state;
  }

  function notify() {
    for (const listener of listeners) {
      listener(state);
    }
  }

  return {
    getState,
    subscribe,
    setMode,
    setOpacity,
    loadImageSession,
    setPlacement,
    patchPlacement,
    addPin,
    removePin,
    clearPins,
    setSolvedTransform,
    invalidateSolvedTransform,
    clearImage,
  };
}

export function normalizeState(candidate = {}) {
  const legacyFit = candidate.fit ?? null;
  const placementCandidate = candidate.placement ?? createLegacyPlacement(legacyFit);
  return {
    mode: candidate.mode === "align" ? "align" : "trace",
    opacity: normalizeOpacity(candidate.opacity),
    image: normalizeImage(candidate.image),
    placement: normalizePlacement(placementCandidate),
    registration: normalizeRegistration(candidate.registration),
  };
}

export function createDefaultState() {
  return normalizeState(DEFAULT_STATE);
}

export function createDefaultRegistration() {
  return normalizeRegistration(DEFAULT_REGISTRATION);
}

export function normalizePlacement(placement) {
  const candidate = placement ?? {};
  return {
    centerMapLatLon: normalizeLatLon(candidate.centerMapLatLon),
    scale: normalizeScale(candidate.scale),
    rotationRad: normalizeRotation(candidate.rotationRad),
  };
}

export function normalizeRegistration(registration) {
  const candidate = registration ?? {};
  const pins = normalizePins(candidate.pins);
  return {
    pins,
    solvedTransform: normalizeSolvedTransform(candidate.solvedTransform),
    dirty: normalizeDirty(candidate.dirty, pins),
  };
}

export function hasCleanSolvedTransform(registration) {
  return Boolean(registration?.solvedTransform) && !registration?.dirty;
}

export function getRegistrationPinCount(registration) {
  return Array.isArray(registration?.pins) ? registration.pins.length : 0;
}

export function canSolveRegistration(registration) {
  return getRegistrationPinCount(registration) >= 2;
}

export function needsSolveRecompute(registration) {
  return canSolveRegistration(registration) && Boolean(registration?.dirty);
}

export function resolveRegistrationSolveState(registration) {
  const pinCount = getRegistrationPinCount(registration);
  if (hasCleanSolvedTransform(registration)) {
    return {
      kind: "solved",
      pinCount,
    };
  }
  if (needsSolveRecompute(registration)) {
    return {
      kind: "dirty",
      pinCount,
    };
  }
  if (pinCount > 0) {
    return {
      kind: "insufficient-pins",
      pinCount,
    };
  }
  return {
    kind: "empty",
    pinCount: 0,
  };
}

function normalizeOpacity(opacity) {
  const number = Number(opacity);
  if (!Number.isFinite(number)) {
    return DEFAULT_STATE.opacity;
  }
  return Math.min(1, Math.max(0, number));
}

function normalizeImage(image) {
  if (!image || typeof image.src !== "string") {
    return null;
  }
  const width = Number(image.width);
  const height = Number(image.height);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }
  return {
    src: image.src,
    width,
    height,
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

function normalizeScale(scale) {
  const value = Number(scale);
  if (!Number.isFinite(value) || value <= 0) {
    return DEFAULT_PLACEMENT.scale;
  }
  return value;
}

function placementsEqual(left, right) {
  return (
    left.centerMapLatLon?.lat === right.centerMapLatLon?.lat &&
    left.centerMapLatLon?.lon === right.centerMapLatLon?.lon &&
    left.scale === right.scale &&
    left.rotationRad === right.rotationRad
  );
}

function normalizeRotation(rotationRad) {
  const value = Number(rotationRad);
  if (!Number.isFinite(value)) {
    return DEFAULT_PLACEMENT.rotationRad;
  }
  return value;
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

function normalizeSolvedTransform(candidate) {
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
    pinCount: Number.isInteger(candidate.pinCount) ? candidate.pinCount : null,
  };
}

function normalizeDirty(dirty, pins) {
  if (!pins.length) {
    return false;
  }
  return Boolean(dirty);
}

function createImagePlacement({ image, centerMapLatLon }) {
  return {
    ...DEFAULT_PLACEMENT,
    centerMapLatLon: normalizeLatLon(centerMapLatLon),
  };
}

function createLegacyPlacement(legacyFit) {
  if (!legacyFit) {
    return null;
  }
  return {
    centerMapLatLon: legacyFit.anchorMapLatLon ?? null,
    scale: legacyFit.scale,
    rotationRad: legacyFit.rotationRad,
  };
}

function createInvalidatedRegistration(registration) {
  return createDirtyRegistration(registration, { clearSolvedTransform: true });
}

function createPlacementEditedRegistration(registration) {
  return createDirtyRegistration(registration, { clearSolvedTransform: false });
}

function createDirtyRegistration(registration, { clearSolvedTransform }) {
  const pins = normalizePins(registration?.pins);
  return normalizeRegistration({
    pins,
    solvedTransform: clearSolvedTransform ? null : registration?.solvedTransform ?? null,
    dirty: pins.length > 0,
  });
}

function getNextPinId(pins) {
  return pins.reduce((maxId, pin) => Math.max(maxId, pin.id), 0) + 1;
}
