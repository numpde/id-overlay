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
