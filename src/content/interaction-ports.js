import { createLogger } from "../core/logger.js";
import { createAdapterDragController } from "./interactions/adapter-drag.js";
import { createPinToggleInteraction } from "./interactions/pin-toggle-interaction.js";
import { createPointerInteraction } from "./interactions/pointer-interaction.js";
import { createWheelInteraction } from "./interactions/wheel-interaction.js";
import { createKeyboardInputRouter } from "./interactions/keyboard-router.js";
import { createInteractionRuntimeBridge } from "./interactions/runtime-bridge.js";
import { createInteractionErrorBoundary } from "./interactions/error-boundary.js";
import { createGestureLifecycle } from "./interactions/gesture-lifecycle.js";

export function createInteractionPorts({
  machineHost,
  pageObservation,
  pageProjection,
  mapGesture,
  keyTarget = globalThis.window,
  keyboardGateway = null,
}) {
  const logger = createLogger("interactions");
  const machineActions = createMachineActionPort(machineHost);
  const adapterDrag = createAdapterDragController({
    pageObservation,
    mapGesture,
    getMachineState,
    machineActions,
    logger,
  });
  const runtimeBridge = createInteractionRuntimeBridge({
    machineHost,
    machineActions,
  });
  const gestureLifecycle = createGestureLifecycle({
    adapterDrag,
    runtimeBridge,
  });
  const errorBoundary = createInteractionErrorBoundary({
    reportRuntimeError: machineActions.reportRuntimeError,
    resetInteraction: resetRuntimeAfterError,
    logger,
  });
  const pinToggleInteraction = createPinToggleInteraction({
    pageObservation,
    pageProjection,
    getMachineState,
    machineActions,
    runtimeBridge,
    errorBoundary,
    logger,
  });
  const wheelInteraction = createWheelInteraction({
    pageObservation,
    mapGesture,
    getMachineState,
    machineActions,
    runtimeBridge,
    errorBoundary,
    logger,
  });
  const pointerInteraction = createPointerInteraction({
    gestureLifecycle,
    runtimeBridge,
    errorBoundary,
  });
  const keyboardRouter = createKeyboardInputRouter({
    keyTarget,
    keyboardGateway,
    getMachineState,
    getRuntimeState,
    getPointerScreenPx,
    executePinToggleAtScreenPoint: pinToggleInteraction.toggleAtScreenPoint,
    selectMode: machineActions.selectMode,
    observePassThroughPress: runtimeBridge.observePassThroughPress,
    observePassThroughRelease: runtimeBridge.observePassThroughRelease,
    resetRuntimeObservation: gestureLifecycle.reset,
    logger,
  });

  const overlayInteractionPort = Object.freeze({
    subscribeRuntime,
    getRuntimeState,
    handlePointerEnter: pointerInteraction.handlePointerEnter,
    handlePointerLeave: pointerInteraction.handlePointerLeave,
    handlePointerMove: pointerInteraction.handlePointerMove,
    handlePointerDown: pointerInteraction.handlePointerDown,
    handlePointerUp: pointerInteraction.handlePointerUp,
    handlePointerCancel: pointerInteraction.handlePointerCancel,
    handleWheel: wheelInteraction.handleWheel,
    handleTogglePin({ screenPoint }) {
      return pinToggleInteraction.toggleAtScreenPoint(screenPoint);
    },
    reportRuntimeError,
  });

  return {
    overlayInteractionPort,
    destroy,
  };

  function destroy() {
    gestureLifecycle.destroy();
    runtimeBridge.destroy();
    keyboardRouter.destroy();
  }

  function subscribeRuntime(listener, options) {
    return runtimeBridge.subscribe(listener, options);
  }

  function getRuntimeState() {
    return runtimeBridge.getRuntimeState();
  }

  function getMachineState() {
    return machineHost.getState();
  }

  function getPointerScreenPx() {
    return runtimeBridge.getPointerScreenPx();
  }

  function resetRuntimeAfterError() {
    gestureLifecycle.reset({
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
}

function createMachineActionPort(machineHost) {
  // TODO(smell): This adapter manually mirrors a growing list of machine host
  // ingress methods. The final port boundary should be generated or grouped by
  // capability so content composition cannot silently drift from host ingress.
  return {
    selectMode: machineHost.selectMode,
    observeRuntimeFact: machineHost.observeRuntimeFact,
    reportRuntimeError: machineHost.reportRuntimeError,
    togglePin: machineHost.togglePin,
    beginOverlayMove: machineHost.beginOverlayMove,
    previewOverlayMove: machineHost.previewOverlayMove,
    commitOverlayMove: machineHost.commitOverlayMove,
    rotateOverlayPlacement: machineHost.rotateOverlayPlacement,
    scaleOverlayPlacement: machineHost.scaleOverlayPlacement,
    changeOpacityByWheel: machineHost.changeOpacityByWheel,
  };
}
