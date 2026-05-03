import {
  createEmptyRegistration,
  createEmptySession,
  isKnownSessionMode,
  normalizeRegistration,
  normalizePlacement,
  normalizeSession,
  normalizeSessionMode,
  normalizeSessionOpacity,
} from "../session.js";
import {
  MACHINE_PANEL_INTENT,
  MACHINE_PLACEMENT_EDIT_KIND,
} from "./events.js";

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
      placementEdit: null,
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
    runtime: normalizeRuntime(runtime),
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

function replaceRuntime(state, runtime) {
  return {
    ...state,
    runtime: normalizeRuntime({
      ...state.runtime,
      ...runtime,
    }),
  };
}

export function replacePlacementEdit(state, placementEdit) {
  return replaceRuntime(state, { placementEdit });
}

function normalizeRuntime(runtime = {}) {
  return {
    pointer: {
      screenPx: normalizePoint(runtime.pointer?.screenPx),
    },
    activeGesture: runtime.activeGesture ?? null,
    inputOverride: runtime.inputOverride ?? null,
    placementEdit: normalizePlacementEdit(runtime.placementEdit),
  };
}

function normalizePlacementEdit(edit) {
  if (!edit || typeof edit !== "object" || !edit.beforeRegistration) {
    return null;
  }
  if (!isKnownPlacementEditKind(edit?.kind)) {
    return null;
  }
  const beforePlacement = normalizePlacement(edit.beforePlacement);
  const previewPlacement = normalizePlacement(edit.previewPlacement);
  if (!beforePlacement || !previewPlacement) {
    return null;
  }
  return {
    kind: edit.kind,
    beforePlacement,
    beforeRegistration: normalizeRegistration(edit.beforeRegistration),
    previewPlacement,
  };
}

function isKnownPlacementEditKind(kind) {
  return Object.values(MACHINE_PLACEMENT_EDIT_KIND).includes(kind);
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
