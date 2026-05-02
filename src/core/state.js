import {
  getOverlayImageOriginalDimensions,
  getOverlayImageWorkingDimensions,
  normalizeOverlayImageMetadata,
} from "./image-normalization.js";
import {
  INTERACTION_MODE,
  normalizeInteractionMode,
} from "./interaction-mode.js";
import {
  DEFAULT_SESSION_MODE,
  DEFAULT_SESSION_OPACITY,
} from "./session-defaults.js";

const DEFAULT_STATE = Object.freeze({
  mode: DEFAULT_SESSION_MODE,
  opacity: DEFAULT_SESSION_OPACITY,
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

// TODO(machine-cutover): Delete this checkpoint table when semantic history
// records are authored by src/core/machine transitions.
// Final semantic-history shape: this low-level checkpoint table should
// disappear. History records should be emitted by the semantic state-machine
// transition that interprets the user action, not inferred from reducer action
// names here.
const HISTORY_ACTIONS = Object.freeze({
  [STATE_ACTION.LOAD_IMAGE_SESSION]: Object.freeze({
    defaultDescriptor: Object.freeze({
      kind: "load-image",
      label: "Loaded screenshot",
    }),
  }),
  [STATE_ACTION.SET_PLACEMENT]: Object.freeze({
    defaultDescriptor: null,
  }),
  [STATE_ACTION.ADD_PIN]: Object.freeze({
    defaultDescriptor: Object.freeze({
      kind: "add-pin",
      label: "Added pin",
    }),
  }),
  [STATE_ACTION.REMOVE_PIN]: Object.freeze({
    defaultDescriptor: Object.freeze({
      kind: "remove-pin",
      label: "Removed pin",
    }),
  }),
  [STATE_ACTION.CLEAR_PINS]: Object.freeze({
    defaultDescriptor: Object.freeze({
      kind: "clear-pins",
      label: "Cleared pins",
    }),
  }),
  [STATE_ACTION.CLEAR_IMAGE]: Object.freeze({
    defaultDescriptor: Object.freeze({
      kind: "clear-image",
      label: "Cleared image",
    }),
  }),
});

export function createStateStore(initialState = {}) {
  let state = normalizeState(initialState);
  // TODO(machine-cutover): Delete store-owned past/future/batch state. The
  // machine history stack should be the single undo/redo source.
  // Final semantic-history shape: past/future/batch fields should move out of
  // this durable session store. This store should not own user-facing undo
  // policy or semantic history labels.
  let past = [];
  let future = [];
  let historyBatchDepth = 0;
  let historyBatchBaseState = null;
  let historyBatchDescriptor = null;
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

  function loadImageSession(image, placement, options = {}) {
    // Final semantic-history shape: this may remain as a compatibility wrapper,
    // but it should not accept historyDescriptor or create history itself.
    return dispatch({
      type: STATE_ACTION.LOAD_IMAGE_SESSION,
      image,
      placement,
      historyDescriptor: options.historyDescriptor ?? null,
    });
  }

  function setPlacement(nextPlacement, options = {}) {
    // Final semantic-history shape: placement history should be emitted by the
    // semantic move/rotate/scale transition, not passed into this low-level
    // setter as a descriptor.
    return dispatch({
      type: STATE_ACTION.SET_PLACEMENT,
      placement: nextPlacement,
      historyDescriptor: options.historyDescriptor ?? null,
    });
  }

  function syncPlacement(nextPlacement) {
    return dispatch({
      type: STATE_ACTION.SYNC_PLACEMENT,
      placement: nextPlacement,
    });
  }

  function addPin({ imagePx, mapLatLon }, options = {}) {
    // Final semantic-history shape: pin history belongs to registration
    // transitions. This store method should become a pure state mutation helper
    // or disappear behind machine events.
    const previousRegistration = state.registration;
    const nextState = dispatch({
      type: STATE_ACTION.ADD_PIN,
      imagePx,
      mapLatLon,
      historyDescriptor: options.historyDescriptor ?? null,
    });
    return resolveRegistrationPinMutation(previousRegistration, nextState.registration).addedPin;
  }

  function removePin(pinId, options = {}) {
    const previousRegistration = state.registration;
    const nextState = dispatch({
      type: STATE_ACTION.REMOVE_PIN,
      pinId,
      historyDescriptor: options.historyDescriptor ?? null,
    });
    return resolveRegistrationPinMutation(previousRegistration, nextState.registration).removedPinIds.includes(pinId);
  }

  function clearPins(options = {}) {
    const previousRegistration = state.registration;
    const nextState = dispatch({
      type: STATE_ACTION.CLEAR_PINS,
      historyDescriptor: options.historyDescriptor ?? null,
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

  function clearImage(options = {}) {
    // Final semantic-history shape: image lifecycle history should come from
    // paste/load/clear transitions, not this low-level method option.
    return dispatch({
      type: STATE_ACTION.CLEAR_IMAGE,
      historyDescriptor: options.historyDescriptor ?? null,
    });
  }

  function canUndo() {
    return past.length > 0;
  }

  function canRedo() {
    return future.length > 0;
  }

  function getUndoDescriptor() {
    // Final semantic-history shape: expose pending semantic history records
    // instead of presentation descriptors.
    return past.at(-1)?.descriptor ?? null;
  }

  function getRedoDescriptor() {
    // Final semantic-history shape: expose pending semantic history records
    // instead of presentation descriptors.
    return future[0]?.descriptor ?? null;
  }

  function beginHistoryBatch(descriptor = null) {
    // Final semantic-history shape: batching should be modeled by the semantic
    // drag/edit transition record. Descriptor-based store batching should
    // disappear.
    historyBatchDepth += 1;
    if (descriptor && historyBatchDepth === 1) {
      historyBatchDescriptor = freezeHistoryDescriptor(descriptor);
    }
  }

  function endHistoryBatch() {
    if (historyBatchDepth === 0) {
      return false;
    }
    historyBatchDepth -= 1;
    if (historyBatchDepth > 0) {
      return false;
    }
    if (historyBatchBaseState && historyBatchBaseState !== state) {
      past = [...past, createHistoryEntry(historyBatchBaseState, historyBatchDescriptor)];
      future = [];
      historyBatchBaseState = null;
      historyBatchDescriptor = null;
      return true;
    }
    historyBatchBaseState = null;
    historyBatchDescriptor = null;
    return false;
  }

  function undo() {
    // TODO(machine-cutover): Delete snapshot undo. Undo must dispatch the
    // semantic history record's undoEvent through the machine transition.
    // Final semantic-history shape: undo should not restore a raw projected
    // snapshot here. It should dispatch the stored history record's undoEvent
    // through the state machine, so mode/effects/presentation are authored by
    // the transition itself.
    if (!canUndo()) {
      return null;
    }
    const nextPast = past.slice(0, -1);
    const previousEntry = past.at(-1);
    future = [createHistoryEntry(state, previousEntry.descriptor), ...future];
    past = nextPast;
    state = restoreUndoableSessionState(state, previousEntry.undoableState);
    notify();
    return previousEntry.descriptor;
  }

  function redo() {
    // TODO(machine-cutover): Delete snapshot redo. Redo must dispatch the
    // semantic history record's redoEvent through the machine transition.
    // Final semantic-history shape: redo should replay the stored redoEvent
    // through the same transition path instead of restoring undoableState.
    if (!canRedo()) {
      return null;
    }
    const [nextEntry, ...nextFuture] = future;
    past = [...past, createHistoryEntry(state, nextEntry.descriptor)];
    future = nextFuture;
    state = restoreUndoableSessionState(state, nextEntry.undoableState);
    notify();
    return nextEntry.descriptor;
  }

  function dispatch(action) {
    // Final semantic-history shape: state dispatch should no longer decide
    // whether an action is a history checkpoint. The transition machine should
    // explicitly return semantic history records for undoable user edits.
    return replaceState(reduceState(state, action), {
      checkpointAction: isHistoryCheckpointAction(action) ? action : null,
    });
  }

  function replaceState(nextState, { checkpointAction = null } = {}) {
    // Final semantic-history shape: replacement may remain the notification
    // boundary, but checkpoint handling should be deleted with store-owned
    // snapshot history.
    if (nextState === state) {
      return state;
    }
    if (checkpointAction) {
      const descriptor = resolveHistoryDescriptor(checkpointAction);
      if (historyBatchDepth > 0) {
        historyBatchBaseState ??= state;
        historyBatchDescriptor ??= descriptor;
      } else {
        past = [...past, createHistoryEntry(state, descriptor)];
        future = [];
      }
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
    canUndo,
    canRedo,
    getUndoDescriptor,
    getRedoDescriptor,
    beginHistoryBatch,
    endHistoryBatch,
    undo,
    redo,
  };
}

export function isHistoryCheckpointAction(action) {
  return Object.hasOwn(HISTORY_ACTIONS, action?.type);
}

function createHistoryEntry(state, descriptor = null) {
  return Object.freeze({
    undoableState: projectUndoableSessionState(state),
    descriptor: freezeHistoryDescriptor(descriptor),
  });
}

function resolveHistoryDescriptor(action) {
  // Final semantic-history shape: this resolver should disappear with
  // descriptor-based snapshot checkpoints. Labels and undo/redo events belong
  // to the semantic transition record that authored the change.
  if (action?.historyDescriptor) {
    return freezeHistoryDescriptor(action.historyDescriptor);
  }
  return HISTORY_ACTIONS[action?.type]?.defaultDescriptor ?? null;
}

function freezeHistoryDescriptor(descriptor) {
  if (!descriptor) {
    return null;
  }
  return Object.freeze({
    kind: descriptor.kind ?? null,
    label: descriptor.label ?? null,
  });
}

function projectUndoableSessionState(state) {
  // TODO(machine-cutover): Delete generic undo snapshots. Each semantic history
  // record should store only the inverse/replay event payload it needs.
  // Final semantic-history shape: this generic projection should disappear.
  // It is the source of accidental field restoration. Undoable records should
  // contain semantic inverse/replay events, with only the domain facts those
  // events need.
  return {
    mode: state.mode,
    image: state.image,
    placement: state.placement,
    registration: state.registration,
  };
}

function restoreUndoableSessionState(currentState, undoableState) {
  // Final semantic-history shape: this raw merge should disappear with
  // snapshot history. Restores must go through reducer transitions.
  if (!undoableState) {
    return currentState;
  }
  return {
    ...currentState,
    ...undoableState,
  };
}

export function reduceState(state, action) {
  // Final semantic-history shape: keep this reducer focused on durable session
  // mutations. User-intent validation, history records, and feedback should be
  // authored by the UI state machine before reaching this layer.
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
  // Final semantic-history shape: normalization is a persistence boundary, not
  // a transition-validity mechanism. The state machine should not rely on
  // normalization to repair impossible in-memory states.
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
  // Final semantic-history shape: loading an image currently bakes in the
  // Align-mode context here. That user-facing mode choice should be visible in
  // the semantic load-image transition.
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
  // Final semantic-history shape: placement writes may still invalidate solved
  // registration, but whether that is undoable and how mode is restored should
  // be decided by the semantic edit transition.
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
  // Final semantic-history shape: clearing to native Trace/no-image is correct
  // durable state, but the user-visible clear-image transition should own the
  // undo/redo record and feedback.
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
  // Final semantic-history shape: loading an image may still author Align as
  // the image-load context, but that choice should be part of the load-image
  // semantic transition record, not hidden in a low-level session helper.
  return {
    mode: INTERACTION_MODE.ALIGN,
    image: normalizeImage(image),
    placement: normalizePlacement(placement),
    registration: createDefaultRegistration(),
  };
}

function createInvalidatedRegistration(registration) {
  // Final semantic-history shape: pin edits invalidating solved transforms is
  // domain state logic, but the edit's history/mode posture belongs outside
  // this helper.
  return createDirtyRegistration(registration, { clearSolvedTransform: true });
}

function createPlacementEditedRegistration(registration) {
  // Final semantic-history shape: preserving solvedTransform while marking it
  // dirty is render-domain logic. Do not use this as an implicit signal for
  // history or fit-overlay transitions.
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
