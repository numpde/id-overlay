export function commitHistoryRecord(state, historyRecord) {
  // TODO(smell): History storage is shape-agnostic while replay expects
  // executable undo/redo events. Once records become semantic domain facts,
  // normalize/validate them here instead of accepting arbitrary record payloads.
  if (!historyRecord) {
    return state;
  }
  return {
    ...state,
    history: {
      past: [...state.history.past, historyRecord],
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
