import {
  MACHINE_HISTORY_KIND,
} from "./events.js";

export const MACHINE_HISTORY_REPLAY_OPERATION = Object.freeze({
  CLEAR_IMAGE: "clear-image",
  RESTORE_IMAGE_SESSION: "restore-image-session",
  RESTORE_REGISTRATION: "restore-registration",
  RESTORE_PLACEMENT: "restore-placement",
});

const KNOWN_HISTORY_KINDS = new Set(Object.values(MACHINE_HISTORY_KIND));
const KNOWN_REPLAY_OPERATIONS = new Set(Object.values(MACHINE_HISTORY_REPLAY_OPERATION));

export function createSemanticHistoryRecord(record) {
  const normalized = normalizeSemanticHistoryRecord(record);
  if (!normalized) {
    throw new TypeError("Invalid semantic history record");
  }
  return normalized;
}

export function normalizeSemanticHistoryRecord(record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    return null;
  }
  const kind = normalizeHistoryKind(record.kind);
  const label = normalizeHistoryLabel(record.label);
  const undoLabel = normalizeHistoryLabel(record.undoLabel);
  const redoLabel = normalizeHistoryLabel(record.redoLabel);
  const undo = normalizeReplay(record.undo);
  const redo = normalizeReplay(record.redo);
  if (!kind || !label || !undoLabel || !redoLabel || !undo || !redo) {
    return null;
  }
  return {
    kind,
    label,
    undoLabel,
    redoLabel,
    undo,
    redo,
  };
}

export function normalizeMachineHistory(history = {}) {
  return {
    past: normalizeHistoryRecordList(history.past),
    future: normalizeHistoryRecordList(history.future),
  };
}

export function commitHistoryRecord(state, historyRecord) {
  const record = normalizeSemanticHistoryRecord(historyRecord);
  if (!record) {
    return state;
  }
  return {
    ...state,
    history: {
      past: [...state.history.past, record],
      future: [],
    },
  };
}

export function peekUndoRecord(state) {
  return state.history.past.at(-1) ?? null;
}

export function peekRedoRecord(state) {
  return state.history.future[0] ?? null;
}

export function moveUndoRecordToFuture(state) {
  const record = peekUndoRecord(state);
  if (!record) {
    return { state, record: null };
  }
  return {
    record,
    state: {
      ...state,
      history: {
        past: state.history.past.slice(0, -1),
        future: [record, ...state.history.future],
      },
    },
  };
}

export function moveRedoRecordToPast(state) {
  const record = peekRedoRecord(state);
  if (!record) {
    return { state, record: null };
  }
  return {
    record,
    state: {
      ...state,
      history: {
        past: [...state.history.past, record],
        future: state.history.future.slice(1),
      },
    },
  };
}

function normalizeHistoryKind(kind) {
  return KNOWN_HISTORY_KINDS.has(kind) ? kind : null;
}

function normalizeHistoryLabel(label) {
  if (typeof label !== "string") {
    return null;
  }
  const trimmed = label.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeReplay(replay) {
  if (!replay || typeof replay !== "object" || Array.isArray(replay)) {
    return null;
  }
  if (!KNOWN_REPLAY_OPERATIONS.has(replay.operation)) {
    return null;
  }
  return {
    ...replay,
    operation: replay.operation,
  };
}

function normalizeHistoryRecordList(records) {
  if (!Array.isArray(records)) {
    return [];
  }
  return records
    .map(normalizeSemanticHistoryRecord)
    .filter(Boolean);
}
