import {
  commitHistoryRecord,
  normalizeSemanticHistoryRecord,
} from "./history.js";
import { replaceStatus } from "./state.js";
import {
  createCancelStatusTimeoutEffect,
  createStartStatusTimeoutEffect,
} from "./effect-requests.js";

export function withHistoryRecord(result) {
  // TODO(smell): History/status finalization still happens through generic
  // result combinators after domain transitions return. In the final shape each
  // domain transition should commit semantic history and status explicitly at
  // the mutation site, leaving this file as simple result construction only.
  const historyRecord = normalizeSemanticHistoryRecord(result.historyRecord);
  if (!historyRecord) {
    return {
      ...result,
      historyRecord: null,
    };
  }
  return {
    ...result,
    state: commitHistoryRecord(result.state, historyRecord),
    historyRecord,
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
