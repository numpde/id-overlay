export function createContentTimerEffectService({
  timers = globalThis,
} = {}) {
  return {
    setPanelTimeout: setTimer,
    clearPanelTimeout: clearTimer,
    setStatusTimeout: setTimer,
    clearStatusTimeout: clearTimer,
  };

  function setTimer(callback, { delayMs }) {
    return timers.setTimeout(callback, delayMs);
  }

  function clearTimer(handle) {
    timers.clearTimeout(handle);
  }
}
