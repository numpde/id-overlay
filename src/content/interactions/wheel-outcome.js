export function createHandledWheelOutcome({ pointerScreenPx, log }) {
  return {
    handled: true,
    pointerScreenPx,
    log,
  };
}

export function createUnhandledWheelOutcome(reason, { log = null } = {}) {
  return {
    handled: false,
    reason,
    log,
  };
}
