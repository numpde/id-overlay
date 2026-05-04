import { FORWARDED_MAP_GESTURE_EVENT_FLAG } from "../page-adapter.js";
import {
  isImagePointWithinBounds,
  resolveOverlayScreenTransform,
  screenPointToRenderedImagePoint,
} from "../../core/transform.js";
import { getOverlayImage, hasOverlayImageSession } from "../../core/session.js";
import {
  selectIsRuntimeDragging,
  selectRuntimePointerScreenPx,
} from "../../core/machine/selectors.js";
import { resolveInputProjection } from "../../core/input-projection.js";
import {
  beginOverlayPointerSequence,
  clearOverlayPointerSequence,
  createInitialOverlayPointerSequenceState,
  hasPendingOverlayPointerSequence,
  resolveOverlayPointerSequenceActivation,
} from "../../core/overlay-pointer-sequence.js";
import { RUNTIME_ERROR_SOURCE } from "../../core/runtime-error.js";
import { createOverlayInputHost } from "./input-host.js";

export function createOverlayInputRouter({
  pageAdapter,
  interactions,
  getMachineState,
  getRuntimeState,
  getSnapshot,
  getMountElement,
}) {
  // TODO(smell): This router still couples pending pointer sequences,
  // hit-testing, and error recovery. Listener ownership now lives in the input
  // host; next cleanup should split DOM event projection from gesture state.
  let pendingPointerSequence = createInitialOverlayPointerSequenceState();
  let isDestroyed = false;
  const inputHost = createOverlayInputHost({
    getMountElement,
    mountedHandlers: {
      handleMountedPointerMove,
      handleMountedPointerLeave,
      handleMountedPointerDown,
      handleMountedClick,
      handleMountedDoubleClick,
      handleMountedWheel,
    },
    globalPointerHandlers: {
      handleGlobalPointerMove,
      handleGlobalPointerUp,
      handleGlobalPointerCancel,
    },
  });

  return {
    syncMountedInputListeners,
    syncGlobalPointerListeners,

    destroy() {
      isDestroyed = true;
      pendingPointerSequence = clearOverlayPointerSequence();
      inputHost.destroy();
    },
  };

  function syncMountedInputListeners() {
    inputHost.syncMountedInputListeners();
  }

  function handleMountedPointerMove(event) {
    runOverlayBoundary("mounted-pointer-move", event, () => {
      if (isForwardedMapGestureEvent(event)) {
        return;
      }
      if (hasPendingOverlayPointerSequence(pendingPointerSequence)) {
        return;
      }
      const runtime = getRuntimeState();
      const screenPoint = toGlobalScreenPoint(event);
      if (selectIsRuntimeDragging(runtime)) {
        interactions.handlePointerMove?.(screenPoint);
        consumeOverlayEvent(event);
        return;
      }
      const pointerPolicy = resolveMountedInputProjection(screenPoint, {
        buttons: event.buttons,
      }).pointerMove;
      if (pointerPolicy.shouldTrackPointer) {
        interactions.handlePointerMove?.(screenPoint);
        return;
      }
      if (selectRuntimePointerScreenPx(runtime)) {
        interactions.handlePointerLeave?.();
      }
    });
  }

  function handleMountedPointerLeave() {
    runOverlayBoundary("mounted-pointer-leave", null, () => {
      if (selectIsRuntimeDragging(getRuntimeState())) {
        return;
      }
      interactions.handlePointerLeave?.();
    });
  }

  function handleMountedPointerDown(event) {
    runOverlayBoundary("mounted-pointer-down", event, () => {
      if (isForwardedMapGestureEvent(event)) {
        return;
      }
      const screenPoint = toGlobalScreenPoint(event);
      const pointerPolicy = resolveMountedInputProjection(screenPoint, {
        button: event.button,
        shiftKey: event.shiftKey,
      }).pointerSequence;
      if (!pointerPolicy.shouldOwnPointerSequence) {
        return;
      }
      setPendingPointerSequence(beginOverlayPointerSequence({
        button: event.button,
        dragMode: pointerPolicy.dragMode,
        startScreenPoint: screenPoint,
      }));
      consumeOverlayEvent(event);
    });
  }

  function handleMountedDoubleClick(event) {
    runOverlayBoundary("mounted-double-click", event, () => {
      if (isForwardedMapGestureEvent(event)) {
        return;
      }
      const screenPoint = toGlobalScreenPoint(event);
      const activationPolicy = resolveMountedInputProjection(screenPoint).activation;
      if (!activationPolicy.shouldTogglePin) {
        return;
      }
      if (!interactions.handleTogglePin({ screenPoint })) {
        return;
      }
      consumeOverlayEvent(event);
    });
  }

  function handleMountedClick(event) {
    runOverlayBoundary("mounted-click", event, () => {
      if (isForwardedMapGestureEvent(event)) {
        return;
      }
      const screenPoint = toGlobalScreenPoint(event);
      const activationPolicy = resolveMountedInputProjection(screenPoint).activation;
      if (!activationPolicy.shouldConsumeClick) {
        return;
      }
      consumeOverlayEvent(event);
    });
  }

  function handleMountedWheel(event) {
    runOverlayBoundary("mounted-wheel", event, () => {
      if (isForwardedMapGestureEvent(event)) {
        return;
      }
      const screenPoint = toGlobalScreenPoint(event);
      const wheelPolicy = resolveMountedInputProjection(screenPoint, {
        shiftKey: event.shiftKey,
        altKey: event.altKey,
        ctrlKey: event.ctrlKey,
      }).wheel;
      if (!wheelPolicy.shouldHandle) {
        return;
      }
      if (!interactions.handleWheel({
        deltaY: event.deltaY,
        wheelMode: wheelPolicy.wheelMode,
        screenPoint,
      })) {
        return;
      }
      if (wheelPolicy.shouldConsume) {
        consumeOverlayEvent(event);
      }
    });
  }

  function handleGlobalPointerMove(event) {
    runOverlayBoundary("global-pointer-move", event, () => {
      if (isForwardedMapGestureEvent(event)) {
        return;
      }
      const screenPoint = toGlobalScreenPoint(event);
      if (!advancePendingPointerSequence(event, screenPoint)) {
        return;
      }
      if (!selectIsRuntimeDragging(getRuntimeState())) {
        syncGlobalPointerListeners();
        return;
      }
      interactions.handlePointerMove?.(screenPoint);
      consumeOverlayEvent(event);
    });
  }

  function advancePendingPointerSequence(event, screenPoint) {
    if (!hasPendingOverlayPointerSequence(pendingPointerSequence)) {
      return true;
    }
    const activation = resolveOverlayPointerSequenceActivation({
      state: pendingPointerSequence,
      screenPoint,
    });
    if (!activation.shouldStartDrag) {
      consumeOverlayEvent(event);
      return false;
    }
    const pendingSequence = activation.sequence;
    interactions.handlePointerMove?.(pendingSequence.startScreenPoint);
    if (!interactions.handlePointerDown({
      button: pendingSequence.button,
      screenPoint: pendingSequence.startScreenPoint,
      dragMode: pendingSequence.dragMode,
    })) {
      setPendingPointerSequence(clearOverlayPointerSequence());
      consumeOverlayEvent(event);
      return false;
    }
    setPendingPointerSequence(clearOverlayPointerSequence());
    return true;
  }

  function handleGlobalPointerUp(event) {
    runOverlayBoundary("global-pointer-up", event, () => {
      if (isForwardedMapGestureEvent(event)) {
        return;
      }
      if (hasPendingOverlayPointerSequence(pendingPointerSequence)) {
        setPendingPointerSequence(clearOverlayPointerSequence());
        consumeOverlayEvent(event);
        return;
      }
      if (!selectIsRuntimeDragging(getRuntimeState())) {
        syncGlobalPointerListeners();
        return;
      }
      interactions.handlePointerUp?.(toGlobalScreenPoint(event));
      consumeOverlayEvent(event);
    });
  }

  function handleGlobalPointerCancel(event) {
    runOverlayBoundary("global-pointer-cancel", event, () => {
      if (isForwardedMapGestureEvent(event)) {
        return;
      }
      setPendingPointerSequence(clearOverlayPointerSequence());
      interactions.handlePointerCancel?.();
      consumeOverlayEvent(event);
    });
  }

  function resolveMountedInputProjection(screenPoint, options = {}) {
    return resolveInputProjection({
      machineState: getMachineState(),
      runtime: getRuntimeState(),
      isPointerOverOverlay: isScreenPointOverOverlay(screenPoint),
      ...options,
    });
  }

  function isScreenPointOverOverlay(screenPoint) {
    const machineState = getMachineState();
    const state = machineState.session;
    if (!hasOverlayImageSession(state)) {
      return false;
    }
    const image = getOverlayImage(state);
    const snapshot = getSnapshot();
    const transform = resolveOverlayScreenTransform({
      state: machineState,
      snapshot,
    });
    if (!transform) {
      return false;
    }
    const imagePoint = screenPointToRenderedImagePoint({
      screenPoint,
      transform,
      snapshot,
    });
    return isImagePointWithinBounds(imagePoint, image);
  }

  function toGlobalScreenPoint(event) {
    return pageAdapter.clientPointToScreen({
      x: event.clientX,
      y: event.clientY,
    });
  }

  function runOverlayBoundary(operation, event, fn) {
    try {
      return fn();
    } catch (error) {
      setPendingPointerSequence(clearOverlayPointerSequence());
      syncGlobalPointerListeners();
      consumeOverlayEvent(event);
      interactions.reportRuntimeError?.({
        source: RUNTIME_ERROR_SOURCE.OVERLAY,
        operation,
        error,
        resetInteraction: true,
      });
      return undefined;
    }
  }

  function setPendingPointerSequence(nextState) {
    pendingPointerSequence = nextState;
    syncGlobalPointerListeners();
  }

  function syncGlobalPointerListeners() {
    if (isDestroyed) {
      return;
    }
    const shouldListenGlobally = (
      hasPendingOverlayPointerSequence(pendingPointerSequence) ||
      selectIsRuntimeDragging(getRuntimeState())
    );
    inputHost.syncGlobalPointerListeners(shouldListenGlobally);
  }
}

function isForwardedMapGestureEvent(event) {
  return event?.[FORWARDED_MAP_GESTURE_EVENT_FLAG] === true;
}

function consumeOverlayEvent(event) {
  event?.preventDefault?.();
  event?.stopPropagation?.();
  event?.stopImmediatePropagation?.();
}
