import {
  MACHINE_INPUT_OVERRIDE,
} from "./events.js";
import { peekRedoRecord, peekUndoRecord } from "./history.js";
import { selectOverlayPolicy } from "./policy.js";

export function selectCanUndo(state) {
  return Boolean(selectUndoRecord(state));
}

export function selectCanRedo(state) {
  return Boolean(selectRedoRecord(state));
}

export function selectUndoRecord(state) {
  return peekUndoRecord(state);
}

export function selectRedoRecord(state) {
  return peekRedoRecord(state);
}

export function selectOverlayPresentation(state, runtime = null) {
  // TODO(smell): This selector returns presentation flags directly from machine
  // policy. The final render boundary should expose an overlay view model that
  // includes geometry/pin visibility/input ownership facts, leaving DOM code to
  // reconcile nodes only.
  const policy = selectOverlayPolicy(state, runtime);
  return {
    mode: policy.mode,
    isPassThrough: policy.isPassThrough,
    arePinsVisible: policy.arePinsVisible,
    ownsPointerHitTesting: policy.ownsPointerHitTesting,
  };
}

export function selectRuntimePointerScreenPx(stateOrRuntime) {
  const runtime = stateOrRuntime?.runtime ?? stateOrRuntime;
  return runtime?.pointer?.screenPx ?? null;
}

export function selectRuntimeGestureKind(stateOrRuntime) {
  const runtime = stateOrRuntime?.runtime ?? stateOrRuntime;
  return runtime?.activeGesture?.kind ?? null;
}

export function selectIsRuntimeDragging(stateOrRuntime) {
  const runtime = stateOrRuntime?.runtime ?? stateOrRuntime;
  return Boolean(runtime?.activeGesture);
}

export function selectIsInputPassThroughActive(stateOrRuntime) {
  const runtime = stateOrRuntime?.runtime ?? stateOrRuntime;
  return runtime?.inputOverride === MACHINE_INPUT_OVERRIDE.PASS_THROUGH;
}
