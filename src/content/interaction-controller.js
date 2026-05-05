import { createLogger } from "../core/logger.js";
import {
  selectIsRuntimeDragging,
} from "../core/machine/selectors.js";
import { createAdapterDragController } from "./interactions/adapter-drag.js";
import { createModeInteraction } from "./interactions/mode-interaction.js";
import { createPinToggleInteraction } from "./interactions/pin-toggle-interaction.js";
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
  const modeInteraction = createModeInteraction({
    dispatchMachine,
    runtimeBridge,
    errorBoundary,
    logger,
  });
  const pinToggleInteraction = createPinToggleInteraction({
    pageAdapter,
    getMachineState,
    dispatchMachine,
    runtimeBridge,
    errorBoundary,
    logger,
  });
  const keyboardRouter = createKeyboardInputRouter({
    keyTarget,
    keyboardGateway,
    getMachineState,
    getRuntimeState,
    getPointerScreenPx,
    executePinToggleAtScreenPoint: pinToggleInteraction.toggleAtScreenPoint,
    applyMode: modeInteraction.select,
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

  function handleTogglePin({ screenPoint }) {
    return pinToggleInteraction.toggleAtScreenPoint(screenPoint);
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
