import {
  MACHINE_MODE,
} from "./events.js";
import {
  MACHINE_STATUS_NOTICE_KIND,
  createStatusNotice,
} from "./status-notices.js";
import {
  MACHINE_HISTORY_REPLAY_OPERATION,
  moveRedoRecordToPast,
  moveUndoRecordToFuture,
} from "./history.js";
import {
  clearPlacementEditRuntime,
} from "./placement-edit-runtime-transition.js";
import {
  createEmptyRegistration,
  replaceRegistration,
  replaceSession,
} from "./state.js";
import {
  createTransitionResult,
} from "./transition-result.js";
import {
  applyMachineStatusNotice,
  clearInvalidPanelIntent,
  clearPanelIntent,
} from "./panel-status-transition.js";
import { resetInputRuntimeState } from "./runtime-transition.js";

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
    return applyMachineStatusNotice(createTransitionResult({
      state,
      statusNotice: createStatusNotice(emptyNoticeKind),
    }));
  }
  const replay = replayHistoryRecord(moved.state, selectReplay(moved.record));
  return applyMachineStatusNotice(createTransitionResult({
    state: replay.state,
    effects: replay.effects,
    statusNotice: createStatusNotice(replayNoticeKind, {
      label: selectLabel(moved.record),
    }),
    consumedHistoryRecord: moved.record,
  }));
}

function replayHistoryRecord(state, replay = {}) {
  switch (replay.operation) {
    case MACHINE_HISTORY_REPLAY_OPERATION.CLEAR_IMAGE:
      return replayClearImage(state);
    case MACHINE_HISTORY_REPLAY_OPERATION.RESTORE_IMAGE_SESSION:
      return replayRestoreImageSession(state, replay);
    case MACHINE_HISTORY_REPLAY_OPERATION.RESTORE_REGISTRATION:
      return replayRestoreRegistration(state, replay);
    case MACHINE_HISTORY_REPLAY_OPERATION.RESTORE_PLACEMENT:
      return replayRestorePlacement(state, replay);
    default:
      return createTransitionResult({ state });
  }
}

function replayClearImage(state) {
  const nextState = resetInputRuntimeState(
    clearPlacementEditRuntime(replaceSession(state, {
      mode: MACHINE_MODE.TRACE,
      image: null,
      placement: null,
      registration: createEmptyRegistration(),
    })),
    { pointerScreenPx: null },
  );
  const panelTransition = clearPanelIntent(state, nextState);
  return createTransitionResult({
    state: panelTransition.state,
    effects: panelTransition.effects,
  });
}

function replayRestoreImageSession(state, replay) {
  const nextState = resetInputRuntimeState(
    clearPlacementEditRuntime(replaceSession(state, replay.session)),
  );
  const panelTransition = clearPanelIntent(state, nextState);
  return createTransitionResult({
    state: panelTransition.state,
    effects: panelTransition.effects,
  });
}

function replayRestoreRegistration(state, replay) {
  const nextState = clearPlacementEditRuntime(replaceSession(
    replaceRegistration(state, replay.registration),
    { mode: replay.mode },
  ));
  const panelTransition = clearInvalidPanelIntent(state, nextState);
  return createTransitionResult({
    state: panelTransition.state,
    effects: panelTransition.effects,
  });
}

function replayRestorePlacement(state, replay) {
  return createTransitionResult({
    state: clearPlacementEditRuntime(replaceRegistration(replaceSession(state, {
      placement: replay.placement,
    }), replay.registration)),
  });
}
