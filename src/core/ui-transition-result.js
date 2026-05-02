// Shared shape for pure UI transition return values.
//
// Final semantic-history shape: this result should also be able to carry the
// optional history record emitted by the state-machine transition itself:
// { kind, undoEvent, redoEvent }. Undo/redo should consume those records by
// dispatching their events through the same transition path.

export function createUiTransitionResult(state, effects = []) {
  return {
    state,
    effects: Object.freeze([...effects]),
  };
}
