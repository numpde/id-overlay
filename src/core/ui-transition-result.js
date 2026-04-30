// Shared shape for pure UI transition return values.

export function createUiTransitionResult(state, effects = []) {
  return {
    state,
    effects: Object.freeze([...effects]),
  };
}
