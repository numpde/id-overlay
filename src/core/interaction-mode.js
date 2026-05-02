export const INTERACTION_MODE = Object.freeze({
  ALIGN: "align",
  TRACE: "trace",
});

export function normalizeInteractionMode(mode) {
  // Final semantic-history shape: defaulting unknown modes to Trace is useful
  // at persistence/input boundaries, but canonical transition code should only
  // receive known modes and should reject/no-op invalid events explicitly.
  return mode === INTERACTION_MODE.ALIGN
    ? INTERACTION_MODE.ALIGN
    : INTERACTION_MODE.TRACE;
}

export function nextMode(mode) {
  return mode === INTERACTION_MODE.ALIGN
    ? INTERACTION_MODE.TRACE
    : INTERACTION_MODE.ALIGN;
}

export function isAlignMode(mode) {
  return mode === INTERACTION_MODE.ALIGN;
}

export function isTraceMode(mode) {
  return mode === INTERACTION_MODE.TRACE;
}
