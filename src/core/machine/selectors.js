import {
  MACHINE_INPUT_OVERRIDE,
} from "./events.js";
import { peekRedoRecord, peekUndoRecord } from "./history.js";
import { selectOverlayPolicy } from "./policy.js";
import { isValidPanelRequestId } from "./state.js";

export function selectCanUndo(state) {
  return Boolean(selectUndoRecord(state));
}

export function selectCanRedo(state) {
  return Boolean(selectRedoRecord(state));
}

export function selectIsCurrentPanelRequest(state, requestId) {
  return isValidPanelRequestId(requestId) && state.panel.requestId === requestId;
}

export function selectUndoRecord(state) {
  return peekUndoRecord(state);
}

export function selectRedoRecord(state) {
  return peekRedoRecord(state);
}

export function selectOverlayPresentation(state, runtime = null) {
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
