import { createLogger } from "../core/logger.js";
import {
  MACHINE_EVENT_KIND,
} from "../core/machine/events.js";
import {
  selectIsRuntimeDragging,
} from "../core/machine/selectors.js";
import { createAdapterDragController } from "./interactions/adapter-drag.js";
import { createPinToggleCommand } from "./interactions/pin-toggle-command.js";
import { createWheelCommand } from "./interactions/wheel-command.js";
import { createKeyboardInputRouter } from "./interactions/keyboard-router.js";
import { createInteractionRuntimeBridge } from "./interactions/runtime-bridge.js";
import { createInteractionErrorBoundary } from "./interactions/error-boundary.js";

export function createInteractionController({
  machineHost,
  pageAdapter,
  keyTarget = globalThis.window,
  keyboardGateway = null,
}) {
  // TODO(smell): This shell still owns command composition. Collapse it into a
  // thin interactions composition module once pointer commands are extracted.
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
  const errorBoundary = createInteractionErrorBoundary({
    dispatchMachine,
    resetInteraction: resetRuntimeAfterError,
    logger,
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
    return errorBoundary.run("apply-mode", () => {
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
    return errorBoundary.run("handle-toggle-pin", () => {
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
    return errorBoundary.run("handle-pointer-move", () => {
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
    return errorBoundary.run("handle-pointer-down", () => {
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
    return errorBoundary.run("handle-pointer-up", () => {
      if (!adapterDrag.end(screenPoint)) {
        return false;
      }
      runtimeBridge.endGesture(screenPoint);
      return true;
    }, { fallbackValue: false });
  }

  function handlePointerCancel() {
    return errorBoundary.run("handle-pointer-cancel", () => {
      runtimeBridge.reset({
        endPointerScreenPx: getPointerScreenPx(),
        pointerScreenPx: null,
      });
      return true;
    });
  }

  function handleWheel({ deltaY, wheelMode, screenPoint }) {
    return errorBoundary.run("handle-wheel", () => {
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

  function resetRuntimeAfterError() {
    runtimeBridge.reset({
      pointerScreenPx: getPointerScreenPx(),
    });
  }

  function reportRuntimeError({
    source,
    operation,
    error,
    message = null,
    recoverable = true,
    details = null,
    resetInteraction = true,
  } = {}) {
    return errorBoundary.report({
      source,
      operation,
      error,
      message,
      recoverable,
      details,
      resetInteraction,
    });
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
