import { commitHistoryRecord } from "./history.js";
import { replaceStatus } from "./state.js";
import {
  createCancelStatusTimeoutEffect,
  createStartStatusTimeoutEffect,
} from "./effects.js";

export function finalizeTransitionResult(result, { commitHistory, commitStatus }) {
  // TODO(smell): Result finalization currently interprets history commits and
  // status timeout lifecycle behind boolean options. If another concern lands
  // here, split this into explicit small interpreters so transition branches do
  // not rely on hidden finalizer policy.
  let state = result.state;
  let effects = result.effects;
  let historyRecord = result.historyRecord;
  if (commitHistory && historyRecord) {
    state = commitHistoryRecord(state, historyRecord);
  } else {
    historyRecord = null;
  }
  if (commitStatus && result.statusNotice) {
    const statusTransition = applyStatusNotice(state, result.statusNotice);
    state = statusTransition.state;
    effects = [...effects, ...statusTransition.effects];
  }
  return {
    state,
    effects,
    historyRecord,
    consumedHistoryRecord: result.consumedHistoryRecord,
  };
}

export function createTransitionResult({
  state,
  effects = [],
  statusNotice = null,
  historyRecord = null,
  consumedHistoryRecord = null,
}) {
  return {
    state,
    effects,
    statusNotice,
    historyRecord,
    consumedHistoryRecord,
  };
}

export function createStatusNotice(kind, payload = null) {
  return kind ? { kind, payload } : null;
}

export function createCancelStatusTimeoutEffects(state) {
  if (!state.status.notice) {
    return [];
  }
  return [
    createCancelStatusTimeoutEffect({
      requestId: state.status.notice.requestId,
    }),
  ];
}

function applyStatusNotice(state, statusNotice) {
  const requestId = state.status.lastRequestId + 1;
  return {
    state: replaceStatus(state, {
      notice: {
        requestId,
        kind: statusNotice.kind,
        payload: statusNotice.payload,
      },
      lastRequestId: requestId,
    }),
    effects: [
      ...createCancelStatusTimeoutEffects(state),
      createStartStatusTimeoutEffect({ requestId }),
    ],
  };
}
