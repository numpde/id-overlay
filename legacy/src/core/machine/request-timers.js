export function createRequestTimerRegistry({
  setTimer = null,
  clearTimer = null,
  delayMs,
  createElapsedResult,
  completeElapsed,
} = {}) {
  const timers = new Map();

  function start(payload = {}) {
    const requestId = payload.requestId;
    cancel({ requestId });
    if (!setTimer) {
      return;
    }
    const handle = setTimer(() => {
      timers.delete(requestId);
      completeElapsed?.(createElapsedResult({ requestId }));
    }, {
      ...payload,
      delayMs,
    });
    timers.set(requestId, handle);
  }

  function cancel({ requestId } = {}) {
    if (!timers.has(requestId)) {
      return;
    }
    const handle = timers.get(requestId);
    timers.delete(requestId);
    clearTimer?.(handle);
  }

  function clearAll() {
    for (const handle of timers.values()) {
      clearTimer?.(handle);
    }
    timers.clear();
  }

  return {
    start,
    cancel,
    clearAll,
  };
}
