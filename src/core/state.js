import {
  getOverlayImageOriginalDimensions,
  getOverlayImageWorkingDimensions,
  normalizeOverlayImageMetadata,
} from "./image-normalization.js";
import {
  INTERACTION_MODE,
  normalizeInteractionMode,
} from "./interaction-mode.js";

const DEFAULT_STATE = Object.freeze({
  mode: INTERACTION_MODE.TRACE,
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
    const previousRegistration = state.registration;
    const nextState = dispatch({
      type: STATE_ACTION.ADD_PIN,
      imagePx,
      mapLatLon,
    });
    return resolveRegistrationPinMutation(previousRegistration, nextState.registration).addedPin;
  }

  function removePin(pinId) {
    const previousRegistration = state.registration;
    const nextState = dispatch({
      type: STATE_ACTION.REMOVE_PIN,
      pinId,
    });
    return resolveRegistrationPinMutation(previousRegistration, nextState.registration).removedPinIds.includes(pinId);
  }

  function clearPins() {
    const previousRegistration = state.registration;
    const nextState = dispatch({
      type: STATE_ACTION.CLEAR_PINS,
    });
    return didRegistrationChange(previousRegistration, nextState.registration);
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
  const baseState = createClearedSessionState();
  return {
    ...baseState,
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
  const nextSessionState = createLoadedImageSessionState({ image, placement });
  if (
    state.mode === nextSessionState.mode &&
    imagesEqual(nextSessionState.image, state.image) &&
    placementsEqual(nextSessionState.placement, state.placement) &&
    registrationsEqual(nextSessionState.registration, state.registration)
  ) {
    return state;
  }
  return {
    ...state,
    ...nextSessionState,
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
  const normalizedRegistration = normalizeRegistration(nextRegistration);
  if (registrationsEqual(normalizedRegistration, state.registration)) {
    return state;
  }
  return {
    ...state,
    registration: normalizedRegistration,
  };
}

function commitAddPinState(state, { imagePx, mapLatLon }) {
  const currentPins = getRegistrationPins(state.registration);
  const pin = normalizePin({
    id: getNextPinId(currentPins),
    imagePx,
    mapLatLon,
  });
  if (!pin) {
    return state;
  }
  return commitRegistrationState(state, createInvalidatedRegistration({
    pins: [...currentPins, pin],
  }));
}

function commitRemovePinState(state, pinId) {
  const currentPins = getRegistrationPins(state.registration);
  const nextPins = currentPins.filter((pin) => pin.id !== pinId);
  if (nextPins.length === currentPins.length) {
    return state;
  }
  return commitRegistrationState(state, createInvalidatedRegistration({
    pins: nextPins,
  }));
}

function commitClearedImageState(state) {
  const nextSessionState = createClearedSessionState();
  if (
    state.mode === nextSessionState.mode &&
    state.image === nextSessionState.image &&
    state.placement === nextSessionState.placement &&
    registrationsEqual(nextSessionState.registration, state.registration)
  ) {
    return state;
  }
  return {
    ...state,
    ...nextSessionState,
  };
}

export function createDefaultState() {
  return createClearedSessionState();
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

export function hasOverlayImageSession(state) {
  return Boolean(state?.image);
}

export function getOverlayImage(state) {
  return hasOverlayImageSession(state) ? state.image : null;
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

function normalizeOpacity(opacity) {
  const number = Number(opacity);
  if (!Number.isFinite(number)) {
    return DEFAULT_STATE.opacity;
  }
  return Math.min(1, Math.max(0, number));
}

function normalizeMode(mode) {
  return normalizeInteractionMode(mode);
}

function normalizeImage(image) {
  return normalizeOverlayImageMetadata(image);
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

function imagesEqual(left, right) {
  const leftWorking = getOverlayImageWorkingDimensions(left);
  const rightWorking = getOverlayImageWorkingDimensions(right);
  const leftOriginal = getOverlayImageOriginalDimensions(left);
  const rightOriginal = getOverlayImageOriginalDimensions(right);
  return (
    leftWorking?.src === rightWorking?.src &&
    leftWorking?.width === rightWorking?.width &&
    leftWorking?.height === rightWorking?.height &&
    leftWorking?.scaleFromOriginal === rightWorking?.scaleFromOriginal &&
    leftOriginal?.width === rightOriginal?.width &&
    leftOriginal?.height === rightOriginal?.height
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

function createClearedSessionState() {
  return {
    mode: DEFAULT_STATE.mode,
    opacity: DEFAULT_STATE.opacity,
    image: null,
    placement: DEFAULT_PLACEMENT,
    registration: createDefaultRegistration(),
  };
}

function createLoadedImageSessionState({ image, placement }) {
  return {
    mode: INTERACTION_MODE.ALIGN,
    image: normalizeImage(image),
    placement: normalizePlacement(placement),
    registration: createDefaultRegistration(),
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
