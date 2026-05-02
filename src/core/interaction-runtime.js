export const DEFAULT_INTERACTION_RUNTIME = Object.freeze({
  // Final semantic-history shape: this is low-level input runtime, not the
  // canonical UI runtime shape. Keep fields here only if they are raw adapter
  // facts; user-visible runtime facts should be projected once into uiState.
  isDragging: false,
  isPassThroughActive: false,
  isPointerInsideImage: false,
  pointerScreenPx: null,
  dragMode: null,
});

export const INTERACTION_RUNTIME_ACTION = Object.freeze({
  SYNC_FROM_STATE: "sync-from-state",
  UPDATE_POINTER: "update-pointer",
  START_DRAG: "start-drag",
  END_DRAG: "end-drag",
  SET_PASS_THROUGH: "set-pass-through",
  RESET: "reset",
});

export function reduceInteractionRuntime(previousRuntime, action) {
  // Final semantic-history shape: runtime transitions that affect user-visible
  // affordances should eventually enter the same UI-machine projection path as
  // session transitions. Avoid adding more panel/status policy here.
  const previous = previousRuntime ?? DEFAULT_INTERACTION_RUNTIME;
  let next = previous;

  switch (action?.type) {
    case INTERACTION_RUNTIME_ACTION.SYNC_FROM_STATE:
      next = {
        ...previous,
      };
      break;
    case INTERACTION_RUNTIME_ACTION.UPDATE_POINTER:
      next = {
        ...previous,
        pointerScreenPx: action.pointerScreenPx,
        isPointerInsideImage: action.isPointerInsideImage,
      };
      break;
    case INTERACTION_RUNTIME_ACTION.START_DRAG:
      next = {
        ...previous,
        pointerScreenPx: action.pointerScreenPx,
        isPointerInsideImage: action.isPointerInsideImage,
        isDragging: true,
        dragMode: action.dragMode,
      };
      break;
    case INTERACTION_RUNTIME_ACTION.END_DRAG:
      next = {
        ...previous,
        pointerScreenPx: action.pointerScreenPx,
        isPointerInsideImage: action.isPointerInsideImage,
        isDragging: false,
        dragMode: null,
      };
      break;
    case INTERACTION_RUNTIME_ACTION.SET_PASS_THROUGH:
      next = {
        ...previous,
        isPassThroughActive: action.isActive,
      };
      break;
    case INTERACTION_RUNTIME_ACTION.RESET:
      next = {
        ...previous,
        isPassThroughActive: false,
        isDragging: false,
        dragMode: null,
        pointerScreenPx: action.pointerScreenPx,
        isPointerInsideImage: action.isPointerInsideImage,
      };
      break;
    default:
      next = previous;
      break;
  }

  return areInteractionRuntimesEqual(previous, next) ? previous : next;
}

export function isRuntimeDragging(runtime) {
  return runtime?.isDragging === true;
}

export function isRuntimePassThroughActive(runtime) {
  return runtime?.isPassThroughActive === true;
}

export function isRuntimePointerInsideImage(runtime) {
  return runtime?.isPointerInsideImage === true;
}

export function getRuntimePointerScreenPx(runtime) {
  return runtime?.pointerScreenPx ?? null;
}

export function getRuntimeDragMode(runtime) {
  return runtime?.dragMode ?? null;
}

function areInteractionRuntimesEqual(previous, next) {
  return (
    isRuntimeDragging(previous) === isRuntimeDragging(next) &&
    isRuntimePassThroughActive(previous) === isRuntimePassThroughActive(next) &&
    isRuntimePointerInsideImage(previous) === isRuntimePointerInsideImage(next) &&
    getRuntimePointerScreenPx(previous)?.x === getRuntimePointerScreenPx(next)?.x &&
    getRuntimePointerScreenPx(previous)?.y === getRuntimePointerScreenPx(next)?.y &&
    getRuntimeDragMode(previous) === getRuntimeDragMode(next)
  );
}
