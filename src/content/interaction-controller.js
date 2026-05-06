import { createLogger } from "../core/logger.js";
import { createAdapterDragController } from "./interactions/adapter-drag.js";
import { createPinToggleInteraction } from "./interactions/pin-toggle-interaction.js";
import { createPointerInteraction } from "./interactions/pointer-interaction.js";
import { createWheelInteraction } from "./interactions/wheel-interaction.js";
import { createKeyboardInputRouter } from "./interactions/keyboard-router.js";
import { createInteractionRuntimeBridge } from "./interactions/runtime-bridge.js";
import { createInteractionErrorBoundary } from "./interactions/error-boundary.js";

export function createInteractionController({
  machineHost,
  pageObservation,
  pageProjection,
  mapGesture,
  keyTarget = globalThis.window,
  keyboardGateway = null,
}) {
  // TODO(smell): This module is now mostly object graph wiring, but the graph is
  // still hand-assembled here. Extract an interaction composition factory once
  // keyboard/runtime command ports are narrower, so bootstrap owns construction
  // and this compatibility facade can disappear.
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
    adapterDrag,
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
    adapterDrag,
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
    resetRuntimeObservation: runtimeBridge.reset,
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
    pointerInteraction.handlePointerEnter(screenPoint);
  }

  function handlePointerLeave() {
    pointerInteraction.handlePointerLeave();
  }

  function handlePointerMove(screenPoint) {
    return pointerInteraction.handlePointerMove(screenPoint);
  }

  function handlePointerDown({ button, screenPoint, dragMode }) {
    return pointerInteraction.handlePointerDown({ button, screenPoint, dragMode });
  }

  function handlePointerUp(screenPoint) {
    return pointerInteraction.handlePointerUp(screenPoint);
  }

  function handlePointerCancel() {
    return pointerInteraction.handlePointerCancel();
  }

  function handleWheel({ deltaY, wheelMode, screenPoint }) {
    return wheelInteraction.handleWheel({ deltaY, wheelMode, screenPoint });
  }

  function getMachineState() {
    return machineHost.getState();
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

function createMachineActionPort(machineHost) {
  return {
    selectMode: machineHost.selectMode,
    observeRuntimeFact: machineHost.observeRuntimeFact,
    reportRuntimeError: machineHost.reportRuntimeError,
    togglePin: machineHost.togglePin,
    applyPlacementEditPlan: machineHost.applyPlacementEditPlan,
    finishPlacementEditPlan: machineHost.finishPlacementEditPlan,
    changeOpacityByWheel: machineHost.changeOpacityByWheel,
  };
}
