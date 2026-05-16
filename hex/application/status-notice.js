export function withStatusNotice(state, notice) {
  return {
    ...state,
    notice,
  };
}

export function withTransientStatusFeedback(state, notice) {
  Object.defineProperty(state, "historyFeedback", {
    value: notice,
    enumerable: false,
    configurable: true,
  });
  return state;
}

export function createOverlayFittedNotice({ pinCount }) {
  return {
    kind: "overlay-fitted",
    pinCount,
  };
}

export function createHistoryEmptyNotice(direction) {
  return {
    kind: "history-empty",
    direction,
  };
}

export function createHistoryReplayedNotice({ record, direction }) {
  return {
    kind: "history-replayed",
    direction,
    historyKind: record.kind,
    ...(record.editKind === undefined ? {} : {
      editKind: record.editKind,
    }),
  };
}
