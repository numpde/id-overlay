import {
  createEmptyRegistration,
  createEmptySession,
  isKnownSessionMode,
  normalizeRegistration,
  normalizeSession,
  normalizeSessionMode,
  normalizeSessionOpacity,
} from "../session.js";
import {
  createPlacementSnapshotKey,
  createRegistrationSnapshotKey,
  createSessionSnapshotKey,
} from "../session-keys.js";
import {
  createInitialRuntime,
  normalizeRuntime,
  replaceInputRuntime,
  replacePlacementEdit,
} from "./runtime-state.js";
import {
  createIdlePanel,
  createInitialStatus,
  isKnownPanelIntent,
  isValidPanelRequestId,
  normalizePanel,
  normalizePanelIntent,
  normalizeStatus,
  replacePanel,
  replaceStatus,
} from "./panel-status-state.js";
import {
  normalizeMachineHistory,
} from "./history.js";

export {
  createEmptyRegistration,
  normalizeRegistration,
  createIdlePanel,
  createInitialRuntime,
  createInitialStatus,
  isKnownPanelIntent,
  isValidPanelRequestId,
  normalizePanel,
  normalizePanelIntent,
  normalizeRuntime,
  normalizeStatus,
  replaceInputRuntime,
  replacePanel,
  replacePlacementEdit,
  replaceStatus,
};

export const normalizeMode = normalizeSessionMode;
export const isKnownMachineMode = isKnownSessionMode;
export const normalizeOpacity = normalizeSessionOpacity;

export function createInitialMachineState(overrides = {}) {
  return normalizeMachineState({
    session: createEmptySession(),
    runtime: createInitialRuntime(),
    panel: createIdlePanel(),
    status: createInitialStatus(),
    history: {
      past: [],
      future: [],
    },
    ...overrides,
  });
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
    status: normalizeStatus(status),
    history: normalizeMachineHistory(history),
  };
}

export function createMachineStateKey(state = {}) {
  return serializeMachineState(normalizeMachineState(state));
}

export function machineStatesEqual(left, right) {
  return createMachineStateKey(left) === createMachineStateKey(right);
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

function serializeMachineState(state) {
  return [
    createSessionSnapshotKey(state.session),
    serializeRuntime(state.runtime),
    serializePanel(state.panel),
    serializeStatus(state.status),
    serializeHistory(state.history),
  ].join("||");
}

function serializeRuntime(runtime) {
  return [
    "runtime",
    serializePoint(runtime.pointer.screenPx),
    runtime.activeGesture?.kind ?? "",
    runtime.inputOverride ?? "",
    serializePlacementEdit(runtime.placementEdit),
  ].join("|");
}

function serializePlacementEdit(placementEdit) {
  if (!placementEdit) {
    return "placement-edit:null";
  }
  return [
    "placement-edit",
    placementEdit.kind,
    createPlacementSnapshotKey(placementEdit.beforePlacement),
    createRegistrationSnapshotKey(placementEdit.beforeRegistration),
    createPlacementSnapshotKey(placementEdit.previewPlacement),
  ].join("|");
}

function serializePanel(panel) {
  return [
    "panel",
    panel.intent,
    panel.requestId ?? "",
  ].join("|");
}

function serializeStatus(status) {
  return [
    "status",
    status.lastRequestId,
    serializeStatusNotice(status.notice),
  ].join("|");
}

function serializeStatusNotice(notice) {
  if (!notice) {
    return "notice:null";
  }
  return [
    "notice",
    notice.requestId,
    notice.kind,
    serializeMachineValue(notice.payload),
  ].join("|");
}

function serializeHistory(history) {
  return [
    "history",
    history.past.map(serializeHistoryRecord).join("~"),
    history.future.map(serializeHistoryRecord).join("~"),
  ].join("|");
}

function serializeHistoryRecord(record) {
  if (!record) {
    return "record:null";
  }
  return [
    encodeMachineKeyPart(record.kind ?? ""),
    encodeMachineKeyPart(record.label ?? ""),
    encodeMachineKeyPart(record.undoLabel ?? ""),
    encodeMachineKeyPart(record.redoLabel ?? ""),
    serializeMachineValue(record.undo ?? null),
    serializeMachineValue(record.redo ?? null),
  ].join("|");
}

function serializePoint(point) {
  return point ? `${point.x},${point.y}` : "point:null";
}

function serializeMachineValue(value) {
  if (value === null) {
    return "null";
  }
  if (value === undefined) {
    return "undefined";
  }
  if (typeof value === "string") {
    return `string:${encodeURIComponent(value)}`;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return `${typeof value}:${String(value)}`;
  }
  if (Array.isArray(value)) {
    return `array:[${value.map(serializeMachineValue).join(",")}]`;
  }
  if (typeof value === "object") {
    return `object:{${Object.keys(value).sort().map((key) => {
      return `${encodeURIComponent(key)}=${serializeMachineValue(value[key])}`;
    }).join(",")}}`;
  }
  return `${typeof value}:${String(value)}`;
}

function encodeMachineKeyPart(value) {
  return encodeURIComponent(String(value));
}
