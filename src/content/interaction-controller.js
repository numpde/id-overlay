import { createLogger } from "../core/logger.js";
import { createRuntimeError, RUNTIME_ERROR_SOURCE } from "../core/runtime-error.js";
import {
  MACHINE_INPUT_OVERRIDE,
  MACHINE_EVENT_KIND,
  MACHINE_STATUS_NOTICE_KIND,
} from "../core/machine/events.js";
import {
  selectIsInputPassThroughActive,
  selectIsRuntimeDragging,
  selectRuntimeGestureKind,
  selectRuntimePointerScreenPx,
} from "../core/machine/selectors.js";
import { createAdapterDragController } from "./interactions/adapter-drag.js";
import { createPinToggleCommand } from "./interactions/pin-toggle-command.js";
import { createWheelCommand } from "./interactions/wheel-command.js";
import { createKeyboardInputRouter } from "./interactions/keyboard-router.js";

export function createInteractionController({
  machineHost,
  pageAdapter,
  keyTarget = globalThis.window,
  keyboardGateway = null,
}) {
  // TODO(smell): This shell is still the widest live interaction boundary:
  // runtime sync/reset, error reporting, and command wiring still meet here.
  // Split those ownership seams before adding another command family.
  const logger = createLogger("interactions");
  let observedRuntime = machineHost.getState().runtime;
  const adapterDrag = createAdapterDragController({
    pageAdapter,
    getMachineState,
    dispatchMachine,
    logger,
  });
  const pinToggleCommand = createPinToggleCommand({
    pageAdapter,
    getMachineState,
    dispatchMachine,
  });
  const wheelCommand = createWheelCommand({
    pageAdapter,
    getMachineState,
    dispatchMachine,
  });

  const unsubscribeMachine = machineHost.subscribe((state) => {
    const previousRuntime = observedRuntime;
    observedRuntime = state.runtime;
    syncAdapterDragFromRuntimeChange(previousRuntime, state.runtime);
  }, { emitCurrent: false });
  const keyboardRouter = createKeyboardInputRouter({
    keyTarget,
    keyboardGateway,
    getMachineState,
    getRuntimeState,
    getPointerScreenPx,
    executePinToggleAtScreenPoint,
    applyMode,
    setPassThrough,
    resetInteractionState,
    logger,
  });

  function destroy() {
    unsubscribeMachine();
    keyboardRouter.destroy();
  }

  function subscribe(listener, options) {
    const { emitCurrent = true } = options ?? {};
    let previousRuntime = getRuntimeState();
    if (emitCurrent) {
      listener(previousRuntime);
    }
    return machineHost.subscribe((state) => {
      const nextRuntime = state.runtime;
      if (!areInputRuntimesEqual(previousRuntime, nextRuntime)) {
        previousRuntime = nextRuntime;
        listener(nextRuntime);
      }
    }, { emitCurrent: false });
  }

  function getRuntimeState() {
    return getMachineState().runtime;
  }

  function applyMode(mode) {
    return runInteractionBoundary("apply-mode", () => {
      resetInteractionState({
        pointerScreenPx: getPointerScreenPx(),
      });
      dispatchMachine({
        type: MACHINE_EVENT_KIND.SELECT_MODE,
        mode,
      });
      logger.info("Requested mode switch", { mode });
      return true;
    });
  }

  function handleTogglePin({ screenPoint }) {
    return runInteractionBoundary("handle-toggle-pin", () => {
      updatePointer(screenPoint);
      return executePinToggleAtScreenPoint(screenPoint);
    }, { fallbackValue: false });
  }

  function executePinToggleAtScreenPoint(screenPoint) {
    const outcome = pinToggleCommand.toggleAtScreenPoint(screenPoint);
    if (!outcome.handled) {
      logger.warn("Pin toggle requested without a valid pin context", {
        reason: outcome.reason,
      });
      return false;
    }
    logger.info("Toggled registration pin", {
      pinId: outcome.existingPinId,
    });
    updatePointer(outcome.pointerScreenPx);
    return true;
  }

  function handlePointerEnter(screenPoint) {
    updatePointer(screenPoint);
  }

  function handlePointerLeave() {
    if (selectIsRuntimeDragging(getRuntimeState())) {
      return;
    }
    updatePointer(null);
  }

  function handlePointerMove(screenPoint) {
    return runInteractionBoundary("handle-pointer-move", () => {
      const runtime = getRuntimeState();
      const dragMode = adapterDrag.getActiveDragMode();
      if (selectIsRuntimeDragging(runtime) && dragMode) {
        adapterDrag.move(screenPoint);
        startDragRuntime(screenPoint, {
          dragMode,
        });
        return true;
      }
      updatePointer(screenPoint);
      return true;
    }, { fallbackValue: false });
  }

  function handlePointerDown({ button, screenPoint, dragMode }) {
    return runInteractionBoundary("handle-pointer-down", () => {
      if (!adapterDrag.begin({ button, screenPoint, dragMode })) {
        return false;
      }
      startDragRuntime(screenPoint, {
        dragMode,
      });
      return true;
    }, { fallbackValue: false });
  }

  function handlePointerUp(screenPoint) {
    return runInteractionBoundary("handle-pointer-up", () => {
      if (!adapterDrag.end(screenPoint)) {
        return false;
      }
      endDragRuntime(screenPoint);
      return true;
    }, { fallbackValue: false });
  }

  function handlePointerCancel() {
    return runInteractionBoundary("handle-pointer-cancel", () => {
      resetInteractionState({
        endPointerScreenPx: getPointerScreenPx(),
        pointerScreenPx: null,
      });
      return true;
    });
  }

  function handleWheel({ deltaY, wheelMode, screenPoint }) {
    return runInteractionBoundary("handle-wheel", () => {
      const outcome = wheelCommand.handleWheel({ deltaY, wheelMode, screenPoint });
      logInteractionOutcome(outcome);
      if (!outcome.handled) {
        return false;
      }
      updatePointer(outcome.pointerScreenPx);
      return true;
    }, { fallbackValue: false });
  }

  function logInteractionOutcome(outcome) {
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

  function updatePointer(pointerScreenPx) {
    dispatchMachine({
      type: MACHINE_EVENT_KIND.UPDATE_POINTER_RUNTIME,
      screenPx: pointerScreenPx,
    });
  }

  function startDragRuntime(pointerScreenPx, { dragMode }) {
    dispatchMachine({
      type: MACHINE_EVENT_KIND.BEGIN_POINTER_GESTURE,
      screenPx: pointerScreenPx,
      gestureKind: dragMode,
    });
  }

  function endDragRuntime(pointerScreenPx) {
    dispatchMachine({
      type: MACHINE_EVENT_KIND.END_POINTER_GESTURE,
      screenPx: pointerScreenPx,
    });
  }

  function setPassThrough(isActive) {
    dispatchMachine({
      type: MACHINE_EVENT_KIND.SET_INPUT_OVERRIDE,
      inputOverride: isActive ? MACHINE_INPUT_OVERRIDE.PASS_THROUGH : null,
    });
  }

  function getMachineState() {
    return machineHost.getState();
  }

  function dispatchMachine(event) {
    return machineHost.dispatch(event);
  }

  function getPointerScreenPx() {
    return selectRuntimePointerScreenPx(getRuntimeState());
  }

  function resetInteractionState({
    endPointerScreenPx = getPointerScreenPx(),
    pointerScreenPx = getPointerScreenPx(),
  } = {}) {
    adapterDrag.cancel(endPointerScreenPx, { commitPlacement: true });
    dispatchMachine({
      type: MACHINE_EVENT_KIND.RESET_INPUT_RUNTIME,
      screenPx: pointerScreenPx,
    });
  }

  function syncAdapterDragFromRuntimeChange(previousRuntime, nextRuntime) {
    if (
      !adapterDrag.hasActive() ||
      !selectIsRuntimeDragging(previousRuntime) ||
      selectIsRuntimeDragging(nextRuntime)
    ) {
      return;
    }
    adapterDrag.cancel(selectRuntimePointerScreenPx(previousRuntime), {
      commitPlacement: false,
    });
  }

  function reportRuntimeError({
    source = RUNTIME_ERROR_SOURCE.INTERACTIONS,
    operation,
    error,
    message = null,
    recoverable = true,
    details = null,
    resetInteraction = true,
  } = {}) {
    if (resetInteraction) {
      resetInteractionState({
        pointerScreenPx: getPointerScreenPx(),
      });
    }
    const runtimeError = createRuntimeError({
      source,
      operation,
      error,
      message,
      recoverable,
      details,
    });
    dispatchMachine({
      type: MACHINE_EVENT_KIND.REPORT_STATUS_NOTICE,
      noticeKind: MACHINE_STATUS_NOTICE_KIND.RUNTIME_ERROR,
      noticePayload: {
        error: runtimeError,
      },
    });
    logger.error("Runtime boundary failed", runtimeError, error);
    return runtimeError;
  }

  function runInteractionBoundary(operation, fn, {
    fallbackValue = null,
    message = null,
    recoverable = true,
    details = null,
    resetInteraction = true,
  } = {}) {
    try {
      return fn();
    } catch (error) {
      reportRuntimeError({
        source: RUNTIME_ERROR_SOURCE.INTERACTIONS,
        operation,
        error,
        message,
        recoverable,
        details,
        resetInteraction,
      });
      return fallbackValue;
    }
  }

  return {
    destroy,
    subscribe,
    getRuntimeState,
    handlePointerEnter,
    handlePointerLeave,
    handlePointerMove,
    handlePointerDown,
    handlePointerUp,
    handlePointerCancel,
    handleWheel,
    handleTogglePin,
    reportRuntimeError,
  };
}

function areInputRuntimesEqual(left, right) {
  return (
    selectRuntimePointerScreenPx(left)?.x === selectRuntimePointerScreenPx(right)?.x &&
    selectRuntimePointerScreenPx(left)?.y === selectRuntimePointerScreenPx(right)?.y &&
    selectRuntimeGestureKind(left) === selectRuntimeGestureKind(right) &&
    selectIsInputPassThroughActive(left) === selectIsInputPassThroughActive(right)
  );
}
