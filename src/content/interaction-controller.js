import { createLogger } from "../core/logger.js";
import { createRuntimeError, RUNTIME_ERROR_SOURCE } from "../core/runtime-error.js";
import {
  MACHINE_EVENT_KIND,
  MACHINE_STATUS_NOTICE_KIND,
} from "../core/machine/events.js";
import {
  selectIsRuntimeDragging,
} from "../core/machine/selectors.js";
import { createAdapterDragController } from "./interactions/adapter-drag.js";
import { createPinToggleCommand } from "./interactions/pin-toggle-command.js";
import { createWheelCommand } from "./interactions/wheel-command.js";
import { createKeyboardInputRouter } from "./interactions/keyboard-router.js";
import { createInteractionRuntimeBridge } from "./interactions/runtime-bridge.js";

export function createInteractionController({
  machineHost,
  pageAdapter,
  keyTarget = globalThis.window,
  keyboardGateway = null,
}) {
  // TODO(smell): This shell still owns error reporting and command composition.
  // Extract the runtime error boundary next, then collapse this into a thin
  // interactions composition module.
  const logger = createLogger("interactions");
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

  const runtimeBridge = createInteractionRuntimeBridge({
    machineHost,
    adapterDrag,
  });
  const keyboardRouter = createKeyboardInputRouter({
    keyTarget,
    keyboardGateway,
    getMachineState,
    getRuntimeState,
    getPointerScreenPx,
    executePinToggleAtScreenPoint,
    applyMode,
    setPassThrough: runtimeBridge.setPassThrough,
    resetInteractionState: runtimeBridge.reset,
    logger,
  });

  function destroy() {
    runtimeBridge.destroy();
    keyboardRouter.destroy();
  }

  function subscribe(listener, options) {
    return runtimeBridge.subscribe(listener, options);
  }

  function getRuntimeState() {
    return runtimeBridge.getRuntimeState();
  }

  function applyMode(mode) {
    return runInteractionBoundary("apply-mode", () => {
      runtimeBridge.reset({
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
      runtimeBridge.updatePointer(screenPoint);
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
    runtimeBridge.updatePointer(outcome.pointerScreenPx);
    return true;
  }

  function handlePointerEnter(screenPoint) {
    runtimeBridge.updatePointer(screenPoint);
  }

  function handlePointerLeave() {
    if (selectIsRuntimeDragging(getRuntimeState())) {
      return;
    }
    runtimeBridge.updatePointer(null);
  }

  function handlePointerMove(screenPoint) {
    return runInteractionBoundary("handle-pointer-move", () => {
      const runtime = getRuntimeState();
      const dragMode = adapterDrag.getActiveDragMode();
      if (selectIsRuntimeDragging(runtime) && dragMode) {
        adapterDrag.move(screenPoint);
        runtimeBridge.beginGesture(screenPoint, {
          gestureKind: dragMode,
        });
        return true;
      }
      runtimeBridge.updatePointer(screenPoint);
      return true;
    }, { fallbackValue: false });
  }

  function handlePointerDown({ button, screenPoint, dragMode }) {
    return runInteractionBoundary("handle-pointer-down", () => {
      if (!adapterDrag.begin({ button, screenPoint, dragMode })) {
        return false;
      }
      runtimeBridge.beginGesture(screenPoint, {
        gestureKind: dragMode,
      });
      return true;
    }, { fallbackValue: false });
  }

  function handlePointerUp(screenPoint) {
    return runInteractionBoundary("handle-pointer-up", () => {
      if (!adapterDrag.end(screenPoint)) {
        return false;
      }
      runtimeBridge.endGesture(screenPoint);
      return true;
    }, { fallbackValue: false });
  }

  function handlePointerCancel() {
    return runInteractionBoundary("handle-pointer-cancel", () => {
      runtimeBridge.reset({
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
      runtimeBridge.updatePointer(outcome.pointerScreenPx);
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

  function getMachineState() {
    return machineHost.getState();
  }

  function dispatchMachine(event) {
    return machineHost.dispatch(event);
  }

  function getPointerScreenPx() {
    return runtimeBridge.getPointerScreenPx();
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
      runtimeBridge.reset({
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
