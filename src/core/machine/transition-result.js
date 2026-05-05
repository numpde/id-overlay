import { commitHistoryRecord } from "./history.js";
import { replaceStatus } from "./state.js";
import {
  createCancelStatusTimeoutEffect,
  createStartStatusTimeoutEffect,
} from "./effects.js";

export function withHistoryRecord(result) {
  if (!result.historyRecord) {
    return {
      ...result,
      historyRecord: null,
    };
  }
  return {
    ...result,
    state: commitHistoryRecord(result.state, result.historyRecord),
  };
}

export function withStatusNotice(result) {
  if (!result.statusNotice) {
    return {
      ...result,
      statusNotice: null,
    };
  }
  const statusTransition = applyStatusNotice(result.state, result.statusNotice);
  return {
    ...result,
    state: statusTransition.state,
    effects: [...result.effects, ...statusTransition.effects],
    statusNotice: null,
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
