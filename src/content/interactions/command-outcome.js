export function applyInteractionCommandOutcome({
  outcome,
  runtimeBridge,
  logger,
}) {
  // TODO(smell): Command outcomes are content-authored mini result objects that
  // drive logging and runtime pointer observation. Final shape should expose a
  // machine-authored semantic result and let one presenter/lifecycle boundary
  // decide logging and pointer observation effects.
  logInteractionCommandOutcome({ outcome, logger });
  if (!outcome.handled) {
    return false;
  }
  runtimeBridge.observePointer(outcome.pointerScreenPx);
  return true;
}

function logInteractionCommandOutcome({ outcome, logger }) {
  if (!outcome.log) {
    return;
  }
  const { level, message, details } = outcome.log;
  if (details === undefined) {
    logger[level]?.(message);
    return;
  }
  logger[level]?.(message, details);
}
