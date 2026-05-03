import {
  createEmptyRegistration,
  createEmptySession,
  isKnownSessionMode,
  normalizeRegistration,
  normalizeSession,
  normalizeSessionMode,
  normalizeSessionOpacity,
} from "../session.js";
import { MACHINE_PANEL_INTENT } from "./events.js";

export {
  createEmptyRegistration,
  normalizeRegistration,
};

export const normalizeMode = normalizeSessionMode;
export const isKnownMachineMode = isKnownSessionMode;
export const normalizeOpacity = normalizeSessionOpacity;

export function createInitialMachineState(overrides = {}) {
  return normalizeMachineState({
    session: createEmptySession(),
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
    session: normalizeSession(session),
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

export function replaceSession(state, session) {
  return {
    ...state,
    session: normalizeSession({
      ...state.session,
      ...session,
    }),
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
