import { MACHINE_MODE, MACHINE_PANEL_INTENT } from "./events.js";

const DEFAULT_OPACITY = 0.6;

export function createInitialMachineState(overrides = {}) {
  return normalizeMachineState({
    session: {
      mode: MACHINE_MODE.TRACE,
      opacity: DEFAULT_OPACITY,
      image: null,
      placement: null,
      registration: createEmptyRegistration(),
    },
    runtime: {
      pointer: {
        screenPx: null,
      },
      activeGesture: null,
      inputOverride: null,
    },
    panel: createIdlePanel(),
    status: {
      messageOverride: null,
    },
    history: {
      past: [],
      future: [],
    },
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

export function createIdlePanel() {
  return {
    intent: MACHINE_PANEL_INTENT.IDLE,
    requestId: null,
  };
}

export function normalizeMachineState(state = {}) {
  const session = state.session ?? {};
  const runtime = state.runtime ?? {};
  const panel = state.panel ?? {};
  const status = state.status ?? {};
  const history = state.history ?? {};

  return {
    session: {
      mode: normalizeMode(session.mode),
      opacity: normalizeOpacity(session.opacity),
      image: session.image ?? null,
      placement: session.placement ?? null,
      registration: normalizeRegistration(session.registration),
    },
    runtime: {
      pointer: {
        screenPx: normalizePoint(runtime.pointer?.screenPx),
      },
      activeGesture: runtime.activeGesture ?? null,
      inputOverride: runtime.inputOverride ?? null,
    },
    panel: normalizePanel(panel),
    status: {
      messageOverride: status.messageOverride ?? null,
    },
    history: {
      past: Array.isArray(history.past) ? history.past : [],
      future: Array.isArray(history.future) ? history.future : [],
    },
  };
}

export function normalizePanel(panel = {}) {
  return {
    intent: normalizePanelIntent(panel.intent),
    requestId: normalizeRequestId(panel.requestId),
  };
}

export function normalizePanelIntent(intent) {
  return isKnownPanelIntent(intent)
    ? intent
    : MACHINE_PANEL_INTENT.IDLE;
}

export function isKnownPanelIntent(intent) {
  return Object.values(MACHINE_PANEL_INTENT).includes(intent);
}

export function isValidPanelRequestId(requestId) {
  return Number.isInteger(requestId) && requestId > 0;
}

export function normalizeRegistration(registration = {}) {
  return {
    pins: Array.isArray(registration.pins) ? registration.pins : [],
    solvedTransform: registration.solvedTransform ?? null,
    dirty: registration.dirty === true,
  };
}

// TODO(machine-cutover): Keep normalizers for persisted/foreign input only.
// Transition predicates should validate event payloads instead of relying on
// default coercion to produce a legal state.
export function normalizeMode(mode) {
  return isKnownMachineMode(mode) ? mode : MACHINE_MODE.TRACE;
}

export function isKnownMachineMode(mode) {
  return Object.values(MACHINE_MODE).includes(mode);
}

export function normalizeOpacity(opacity) {
  return Number.isFinite(opacity) ? Math.min(1, Math.max(0, opacity)) : DEFAULT_OPACITY;
}

export function replaceSession(state, session) {
  return {
    ...state,
    session: {
      ...state.session,
      ...session,
    },
  };
}

export function replaceRegistration(state, registration) {
  return replaceSession(state, {
    registration: normalizeRegistration(registration),
  });
}

export function replacePanel(state, panel) {
  return {
    ...state,
    panel: normalizePanel({
      ...state.panel,
      ...panel,
    }),
  };
}

export function replaceHistory(state, history) {
  return {
    ...state,
    history: {
      past: history.past ?? state.history.past,
      future: history.future ?? state.history.future,
    },
  };
}

function normalizePoint(point) {
  if (!Number.isFinite(point?.x) || !Number.isFinite(point?.y)) {
    return null;
  }
  return { x: point.x, y: point.y };
}

function normalizeRequestId(requestId) {
  return isValidPanelRequestId(requestId) ? requestId : null;
}
