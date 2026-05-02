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
    panel: {
      intent: MACHINE_PANEL_INTENT.IDLE,
    },
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
    panel: {
      intent: Object.values(MACHINE_PANEL_INTENT).includes(panel.intent)
        ? panel.intent
        : MACHINE_PANEL_INTENT.IDLE,
    },
    status: {
      messageOverride: status.messageOverride ?? null,
    },
    history: {
      past: Array.isArray(history.past) ? history.past : [],
      future: Array.isArray(history.future) ? history.future : [],
    },
  };
}

export function normalizeRegistration(registration = {}) {
  return {
    pins: Array.isArray(registration.pins) ? registration.pins : [],
    solvedTransform: registration.solvedTransform ?? null,
    dirty: registration.dirty === true,
  };
}

export function normalizeMode(mode) {
  return mode === MACHINE_MODE.ALIGN ? MACHINE_MODE.ALIGN : MACHINE_MODE.TRACE;
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
