export const INTERACTION_MODE = Object.freeze({
  ALIGN: "align",
  TRACE: "trace",
});

export function normalizeInteractionMode(mode) {
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
