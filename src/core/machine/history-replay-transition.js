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

export function transitionUndo(state, { transitionSemantic }) {
  const moved = moveUndoRecordToFuture(state);
  if (!moved.record) {
    return finalizeTransitionResult(createTransitionResult({
      state,
      statusNotice: createStatusNotice(MACHINE_STATUS_NOTICE_KIND.UNDO_EMPTY),
    }), {
      commitHistory: false,
      commitStatus: true,
    });
  }
  const replay = finalizeTransitionResult(transitionSemantic(moved.state, moved.record.undoEvent), {
    commitHistory: false,
    commitStatus: false,
  });
  return finalizeTransitionResult(createTransitionResult({
    state: replay.state,
    effects: replay.effects,
    statusNotice: createStatusNotice(MACHINE_STATUS_NOTICE_KIND.UNDO, {
      label: moved.record.undoLabel,
    }),
    consumedHistoryRecord: moved.record,
  }), {
    commitHistory: false,
    commitStatus: true,
  });
}

export function transitionRedo(state, { transitionSemantic }) {
  const moved = moveRedoRecordToPast(state);
  if (!moved.record) {
    return finalizeTransitionResult(createTransitionResult({
      state,
      statusNotice: createStatusNotice(MACHINE_STATUS_NOTICE_KIND.REDO_EMPTY),
    }), {
      commitHistory: false,
      commitStatus: true,
    });
  }
  const replay = finalizeTransitionResult(transitionSemantic(moved.state, moved.record.redoEvent), {
    commitHistory: false,
    commitStatus: false,
  });
  return finalizeTransitionResult(createTransitionResult({
    state: replay.state,
    effects: replay.effects,
    statusNotice: createStatusNotice(MACHINE_STATUS_NOTICE_KIND.REDO, {
      label: moved.record.redoLabel,
    }),
    consumedHistoryRecord: moved.record,
  }), {
    commitHistory: false,
    commitStatus: true,
  });
}
