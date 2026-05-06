export function applyInteractionCommandOutcome({
  outcome,
  runtimeBridge,
  logger,
}) {
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
