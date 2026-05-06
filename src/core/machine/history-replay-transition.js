import { MACHINE_STATUS_NOTICE_KIND } from "./status-notices.js";
import {
  MACHINE_HISTORY_REPLAY_OPERATION,
  moveRedoRecordToPast,
  moveUndoRecordToFuture,
} from "./history.js";
import {
  restorePlacement,
} from "./placement-transition.js";
import {
  restoreRegistration,
} from "./registration-transition.js";
import {
  clearImage,
  restoreImageSession,
} from "./session-transition.js";
import {
  createStatusNotice,
  createTransitionResult,
  withStatusNotice,
} from "./transition-result.js";

export function transitionUndo(state) {
  return replayHistoryTransition(state, {
    moveRecord: moveUndoRecordToFuture,
    selectReplay: (record) => record.undo,
    selectLabel: (record) => record.undoLabel,
    emptyNoticeKind: MACHINE_STATUS_NOTICE_KIND.UNDO_EMPTY,
    replayNoticeKind: MACHINE_STATUS_NOTICE_KIND.UNDO,
  });
}

export function transitionRedo(state) {
  return replayHistoryTransition(state, {
    moveRecord: moveRedoRecordToPast,
    selectReplay: (record) => record.redo,
    selectLabel: (record) => record.redoLabel,
    emptyNoticeKind: MACHINE_STATUS_NOTICE_KIND.REDO_EMPTY,
    replayNoticeKind: MACHINE_STATUS_NOTICE_KIND.REDO,
  });
}

function replayHistoryTransition(state, {
  moveRecord,
  selectReplay,
  selectLabel,
  emptyNoticeKind,
  replayNoticeKind,
}) {
  const moved = moveRecord(state);
  if (!moved.record) {
    return withStatusNotice(createTransitionResult({
      state,
      statusNotice: createStatusNotice(emptyNoticeKind),
    }));
  }
  const replay = withoutReplaySideEffects(
    replayHistoryRecord(moved.state, selectReplay(moved.record)),
  );
  return withStatusNotice(createTransitionResult({
    state: replay.state,
    effects: replay.effects,
    statusNotice: createStatusNotice(replayNoticeKind, {
      label: selectLabel(moved.record),
    }),
    consumedHistoryRecord: moved.record,
  }));
}

function replayHistoryRecord(state, replay = {}) {
  // TODO(smell): History replay still re-enters domain transition functions and
  // strips side effects afterward. Replay should apply explicit before/after
  // semantic records directly so undo/redo cannot depend on command behavior.
  switch (replay.operation) {
    case MACHINE_HISTORY_REPLAY_OPERATION.CLEAR_IMAGE:
      return clearImage(state);
    case MACHINE_HISTORY_REPLAY_OPERATION.RESTORE_IMAGE_SESSION:
      return restoreImageSession(state, { session: replay.session });
    case MACHINE_HISTORY_REPLAY_OPERATION.RESTORE_REGISTRATION:
      return restoreRegistration(state, {
        registration: replay.registration,
        mode: replay.mode,
      });
    case MACHINE_HISTORY_REPLAY_OPERATION.RESTORE_PLACEMENT:
      return restorePlacement(state, {
        placement: replay.placement,
        registration: replay.registration,
      });
    default:
      return createTransitionResult({ state });
  }
}

function withoutReplaySideEffects(result) {
  return createTransitionResult({
    state: result.state,
    effects: result.effects,
  });
}
