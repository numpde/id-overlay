import {
  createPlacementSnapshotKey,
  createRegistrationSnapshotKey,
  createSessionSnapshotKey,
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
  MACHINE_INPUT_OVERRIDE,
  MACHINE_PANEL_INTENT,
  MACHINE_PLACEMENT_EDIT_KIND,
  MACHINE_POINTER_GESTURE_KIND,
  MACHINE_STATUS_NOTICE_KIND,
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
      notice: null,
      lastRequestId: 0,
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
    status: normalizeStatus(status),
    history: {
      past: Array.isArray(history.past) ? history.past : [],
      future: Array.isArray(history.future) ? history.future : [],
    },
  };
}

export function createMachineStateKey(state = {}) {
  return serializeMachineState(normalizeMachineState(state));
}

export function machineStatesEqual(left, right) {
  return createMachineStateKey(left) === createMachineStateKey(right);
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

export function replaceStatus(state, status) {
  return {
    ...state,
    status: normalizeStatus({
      ...state.status,
      ...status,
    }),
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

export function replaceInputRuntime(state, {
  pointerScreenPx = state.runtime.pointer.screenPx,
  activeGesture = state.runtime.activeGesture,
  inputOverride = state.runtime.inputOverride,
} = {}) {
  return replaceRuntime(state, {
    pointer: {
      screenPx: pointerScreenPx,
    },
    activeGesture,
    inputOverride,
  });
}

function normalizeRuntime(runtime = {}) {
  return {
    pointer: {
      screenPx: normalizePoint(runtime.pointer?.screenPx),
    },
    activeGesture: normalizeActiveGesture(runtime.activeGesture),
    inputOverride: normalizeInputOverride(runtime.inputOverride),
    placementEdit: normalizePlacementEdit(runtime.placementEdit),
  };
}

function normalizeActiveGesture(activeGesture) {
  if (!activeGesture || typeof activeGesture !== "object") {
    return null;
  }
  if (!Object.values(MACHINE_POINTER_GESTURE_KIND).includes(activeGesture.kind)) {
    return null;
  }
  return {
    kind: activeGesture.kind,
  };
}

function normalizeInputOverride(inputOverride) {
  return inputOverride === MACHINE_INPUT_OVERRIDE.PASS_THROUGH ? inputOverride : null;
}

function normalizeStatus(status = {}) {
  const notice = normalizeStatusNotice(status.notice);
  const lastRequestId = normalizeStatusRequestId(status.lastRequestId);
  return {
    notice,
    lastRequestId: Math.max(lastRequestId, notice?.requestId ?? 0),
  };
}

function normalizeStatusNotice(notice) {
  if (!notice || typeof notice !== "object") {
    return null;
  }
  if (!isKnownStatusNoticeKind(notice.kind)) {
    return null;
  }
  const requestId = normalizeRequestId(notice.requestId);
  if (requestId === null) {
    return null;
  }
  return {
    requestId,
    kind: notice.kind,
    payload: notice.payload ?? null,
  };
}

function isKnownStatusNoticeKind(kind) {
  return Object.values(MACHINE_STATUS_NOTICE_KIND).includes(kind);
}

function normalizeStatusRequestId(requestId) {
  const value = Number(requestId);
  return Number.isInteger(value) && value >= 0 ? value : 0;
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
    serializeMachineValue(record.undoEvent ?? null),
    serializeMachineValue(record.redoEvent ?? null),
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
