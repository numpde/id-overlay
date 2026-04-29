const DEFAULT_STATE = Object.freeze({
  mode: "trace",
  opacity: 0.6,
  image: null,
  placement: null,
  registration: {
    pins: [],
    solvedTransform: null,
    dirty: false,
  },
});

const DEFAULT_PLACEMENT = DEFAULT_STATE.placement;
const DEFAULT_REGISTRATION = Object.freeze({ ...DEFAULT_STATE.registration });

export const STATE_ACTION = Object.freeze({
  SET_MODE: "set-mode",
  SET_OPACITY: "set-opacity",
  LOAD_IMAGE_SESSION: "load-image-session",
  SET_PLACEMENT: "set-placement",
  SYNC_PLACEMENT: "sync-placement",
  ADD_PIN: "add-pin",
  REMOVE_PIN: "remove-pin",
  CLEAR_PINS: "clear-pins",
  SET_SOLVED_TRANSFORM: "set-solved-transform",
  INVALIDATE_SOLVED_TRANSFORM: "invalidate-solved-transform",
  CLEAR_IMAGE: "clear-image",
});

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
    return dispatch({
      type: STATE_ACTION.SET_MODE,
      mode,
    });
  }

  function setOpacity(opacity) {
    return dispatch({
      type: STATE_ACTION.SET_OPACITY,
      opacity,
    });
  }

  function loadImageSession(image, placement) {
    return dispatch({
      type: STATE_ACTION.LOAD_IMAGE_SESSION,
      image,
      placement,
    });
  }

  function setPlacement(nextPlacement) {
    return dispatch({
      type: STATE_ACTION.SET_PLACEMENT,
      placement: nextPlacement,
    });
  }

  function syncPlacement(nextPlacement) {
    return dispatch({
      type: STATE_ACTION.SYNC_PLACEMENT,
      placement: nextPlacement,
    });
  }

  function addPin({ imagePx, mapLatLon }) {
    const previousPinCount = state.registration.pins.length;
    const nextState = dispatch({
      type: STATE_ACTION.ADD_PIN,
      imagePx,
      mapLatLon,
    });
    if (nextState.registration.pins.length === previousPinCount) {
      return null;
    }
    return nextState.registration.pins.at(-1) ?? null;
  }

  function removePin(pinId) {
    const previousPinCount = state.registration.pins.length;
    const nextState = dispatch({
      type: STATE_ACTION.REMOVE_PIN,
      pinId,
    });
    return nextState.registration.pins.length !== previousPinCount;
  }

  function clearPins() {
    return dispatch({
      type: STATE_ACTION.CLEAR_PINS,
    });
  }

  function setSolvedTransform(solvedTransform) {
    return dispatch({
      type: STATE_ACTION.SET_SOLVED_TRANSFORM,
      solvedTransform,
    });
  }

  function invalidateSolvedTransform() {
    return dispatch({
      type: STATE_ACTION.INVALIDATE_SOLVED_TRANSFORM,
    });
  }

  function clearImage() {
    return dispatch({
      type: STATE_ACTION.CLEAR_IMAGE,
    });
  }

  function dispatch(action) {
    return replaceState(reduceState(state, action));
  }

  function replaceState(nextState) {
    if (nextState === state) {
      return state;
    }
    state = nextState;
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
    syncPlacement,
    addPin,
    removePin,
    clearPins,
    setSolvedTransform,
    invalidateSolvedTransform,
    clearImage,
  };
}

export function reduceState(state, action) {
  switch (action?.type) {
    case STATE_ACTION.SET_MODE:
      return commitModeState(state, action.mode);
    case STATE_ACTION.SET_OPACITY:
      return commitOpacityState(state, action.opacity);
    case STATE_ACTION.LOAD_IMAGE_SESSION:
      return commitImageSessionState(state, {
        image: action.image,
        placement: action.placement,
      });
    case STATE_ACTION.SET_PLACEMENT:
      return commitPlacementState(state, action.placement, {
        preserveRegistration: false,
      });
    case STATE_ACTION.SYNC_PLACEMENT:
      return commitPlacementState(state, action.placement, {
        preserveRegistration: true,
      });
    case STATE_ACTION.ADD_PIN:
      return commitAddPinState(state, {
        imagePx: action.imagePx,
        mapLatLon: action.mapLatLon,
      });
    case STATE_ACTION.REMOVE_PIN:
      return commitRemovePinState(state, action.pinId);
    case STATE_ACTION.CLEAR_PINS:
      return commitRegistrationState(state, createDefaultRegistration());
    case STATE_ACTION.SET_SOLVED_TRANSFORM:
      return commitRegistrationState(state, {
        ...state.registration,
        solvedTransform: action.solvedTransform,
        dirty: false,
      });
    case STATE_ACTION.INVALIDATE_SOLVED_TRANSFORM:
      return commitRegistrationState(state, createInvalidatedRegistration(state.registration));
    case STATE_ACTION.CLEAR_IMAGE:
      return commitClearedImageState(state);
    default:
      return state;
  }
}

export function normalizeState(candidate = {}) {
  const legacyFit = candidate.fit ?? null;
  const placementCandidate = candidate.placement ?? createLegacyPlacement(legacyFit);
  return {
    mode: normalizeMode(candidate.mode),
    opacity: normalizeOpacity(candidate.opacity),
    image: normalizeImage(candidate.image),
    placement: normalizePlacement(placementCandidate),
    registration: normalizeRegistration(candidate.registration),
  };
}

function commitModeState(state, mode) {
  const normalizedMode = normalizeMode(mode);
  if (state.mode === normalizedMode) {
    return state;
  }
  return {
    ...state,
    mode: normalizedMode,
  };
}

function commitOpacityState(state, opacity) {
  const normalizedOpacity = normalizeOpacity(opacity);
  if (state.opacity === normalizedOpacity) {
    return state;
  }
  return {
    ...state,
    opacity: normalizedOpacity,
  };
}

function commitImageSessionState(state, { image, placement }) {
  const normalizedImage = normalizeImage(image);
  const normalizedPlacement = normalizePlacement(placement);
  return {
    ...state,
    mode: "align",
    image: normalizedImage,
    placement: normalizedPlacement,
    registration: createDefaultRegistration(),
  };
}

function commitPlacementState(state, nextPlacement, { preserveRegistration }) {
  const normalizedPlacement = normalizePlacement(nextPlacement);
  if (placementsEqual(normalizedPlacement, state.placement)) {
    return state;
  }
  return {
    ...state,
    placement: normalizedPlacement,
    registration: preserveRegistration
      ? normalizeRegistration(state.registration)
      : createPlacementEditedRegistration(state.registration),
  };
}

function commitRegistrationState(state, nextRegistration) {
  return {
    ...state,
    registration: normalizeRegistration(nextRegistration),
  };
}

function commitAddPinState(state, { imagePx, mapLatLon }) {
  const pin = normalizePin({
    id: getNextPinId(state.registration.pins),
    imagePx,
    mapLatLon,
  });
  if (!pin) {
    return state;
  }
  return commitRegistrationState(state, createInvalidatedRegistration({
    pins: [...state.registration.pins, pin],
  }));
}

function commitRemovePinState(state, pinId) {
  const nextPins = state.registration.pins.filter((pin) => pin.id !== pinId);
  if (nextPins.length === state.registration.pins.length) {
    return state;
  }
  return commitRegistrationState(state, createInvalidatedRegistration({
    pins: nextPins,
  }));
}

function commitClearedImageState(state) {
  return {
    ...state,
    mode: "trace",
    image: null,
    placement: DEFAULT_PLACEMENT,
    registration: createDefaultRegistration(),
  };
}

export function createDefaultState() {
  return normalizeState(DEFAULT_STATE);
}

export function createDefaultRegistration() {
  return normalizeRegistration(DEFAULT_REGISTRATION);
}

export function normalizePlacement(placement) {
  return normalizeSolvedTransform(placement);
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
  return resolveRegistrationSolveState(registration).kind === "solved";
}

export function getRegistrationPinCount(registration) {
  return Array.isArray(registration?.pins) ? registration.pins.length : 0;
}

export function canSolveRegistration(registration) {
  return resolveRegistrationSolveState(registration).canCompute;
}

export function needsSolveRecompute(registration) {
  return resolveRegistrationSolveState(registration).kind === "dirty";
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

function normalizeOpacity(opacity) {
  const number = Number(opacity);
  if (!Number.isFinite(number)) {
    return DEFAULT_STATE.opacity;
  }
  return Math.min(1, Math.max(0, number));
}

function normalizeMode(mode) {
  return mode === "align" ? "align" : "trace";
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

function placementsEqual(left, right) {
  return (
    left?.type === right?.type &&
    left?.a === right?.a &&
    left?.b === right?.b &&
    left?.tx === right?.tx &&
    left?.ty === right?.ty
  );
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
    ...(Number.isInteger(candidate.pinCount) ? { pinCount: candidate.pinCount } : {}),
  };
}

function normalizeDirty(dirty, pins) {
  if (!pins.length) {
    return false;
  }
  return Boolean(dirty);
}

function createLegacyPlacement(legacyFit) {
  if (!legacyFit || legacyFit.type !== "similarity") {
    return null;
  }
  return normalizeSolvedTransform(legacyFit);
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
