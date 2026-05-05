import {
  MACHINE_STATUS_NOTICE_KIND,
} from "./events.js";
import {
  moveRedoRecordToPast,
  moveUndoRecordToFuture,
} from "./history.js";
import {
  createStatusNotice,
  createTransitionResult,
  finalizeTransitionResult,
} from "./transition-result.js";

export function transitionUndo(state, { transitionPrivateDomainEvent }) {
  // TODO(smell): Undo/redo replay still selects executable events from history
  // records. The final shape should replay typed semantic records through
  // machine-private domain operations so history cannot depend on event
  // payloads.
  return replayHistoryTransition(state, {
    moveRecord: moveUndoRecordToFuture,
    selectEvent: (record) => record.undoEvent,
    selectLabel: (record) => record.undoLabel,
    emptyNoticeKind: MACHINE_STATUS_NOTICE_KIND.UNDO_EMPTY,
    replayNoticeKind: MACHINE_STATUS_NOTICE_KIND.UNDO,
    transitionPrivateDomainEvent,
  });
}

export function transitionRedo(state, { transitionPrivateDomainEvent }) {
  return replayHistoryTransition(state, {
    moveRecord: moveRedoRecordToPast,
    selectEvent: (record) => record.redoEvent,
    selectLabel: (record) => record.redoLabel,
    emptyNoticeKind: MACHINE_STATUS_NOTICE_KIND.REDO_EMPTY,
    replayNoticeKind: MACHINE_STATUS_NOTICE_KIND.REDO,
    transitionPrivateDomainEvent,
  });
}

function replayHistoryTransition(state, {
  moveRecord,
  selectEvent,
  selectLabel,
  emptyNoticeKind,
  replayNoticeKind,
  transitionPrivateDomainEvent,
}) {
  const moved = moveRecord(state);
  if (!moved.record) {
    return finalizeTransitionResult(createTransitionResult({
      state,
      statusNotice: createStatusNotice(emptyNoticeKind),
    }), {
      commitHistory: false,
      commitStatus: true,
    });
  }
  const replay = finalizeTransitionResult(
    transitionPrivateDomainEvent(moved.state, selectEvent(moved.record)),
    {
      commitHistory: false,
      commitStatus: false,
    },
  );
  return finalizeTransitionResult(createTransitionResult({
    state: replay.state,
    effects: replay.effects,
    statusNotice: createStatusNotice(replayNoticeKind, {
      label: selectLabel(moved.record),
    }),
    consumedHistoryRecord: moved.record,
  }), {
    commitHistory: false,
    commitStatus: true,
  });
}
