import { createValueStore } from "./value-store.js";
import { createLogger } from "./logger.js";
import { createRuntimeError, RUNTIME_ERROR_SOURCE } from "./runtime-error.js";
import {
  getOverlayImage,
  hasCleanSolvedTransform,
  hasOverlayImageSession,
  needsSolveRecompute,
  resolveRegistrationSolveState,
} from "./state.js";
import {
  buildPinRenderModels,
  createPlacementTransform,
  createSimilarityTransformFromAnchor,
  derivePlacementFromScreenTransform,
  hitTestPin,
  imagePointToRenderedScreenPoint,
  imagePointToScreenPoint,
  isImagePointWithinBounds,
  opacityFromWheelDelta,
  resolveOverlayRenderSource,
  resolveOverlayScreenTransform,
  rotationFromWheelDelta,
  scaleFromWheelDelta,
  screenPointToImagePoint,
  screenPointToRenderedImagePoint,
  solveSimilarityTransform,
} from "./transform.js";
import { getOverlayImageLoadStats } from "./image-normalization.js";

export const INTERACTION_MODE = Object.freeze({
  ALIGN: "align",
  TRACE: "trace",
});

export const KEYBOARD_SHORTCUT_ACTION = Object.freeze({
  TOGGLE_PIN_CURRENT_POINTER: "toggle-pin-current-pointer",
  SWITCH_TO_TRACE: "switch-to-trace",
  ENABLE_PASS_THROUGH: "enable-pass-through",
});

export const INTERACTION_EVENT = Object.freeze({
  PIN_RESULT: "pin-result",
  SOLVE_RESULT: "solve-result",
  PINS_CLEARED: "pins-cleared",
  RUNTIME_ERROR: "runtime-error",
});

export const PIN_RESULT_ACTION = Object.freeze({
  ADDED: "added",
  REMOVED: "removed",
});

export const PIN_RESULT_REASON = Object.freeze({
  POINTER_OUTSIDE_IMAGE: "pointer-outside-image",
  NOT_ALIGN_MODE: "not-align-mode",
  NO_IMAGE: "no-image",
  NO_POINTER: "no-pointer",
});

export const SOLVE_RESULT_REASON = Object.freeze({
  INSUFFICIENT_PINS: "insufficient-pins",
  SOLVE_FAILED: "solve-failed",
});

export const DRAG_MODE = Object.freeze({
  MOVE_OVERLAY: "move-overlay",
  MAP_PAN: "map-pan",
});

export const WHEEL_MODE = Object.freeze({
  MAP_ZOOM: "map-zoom",
  ZOOM_OVERLAY: "zoom-overlay",
  ROTATE_OVERLAY: "rotate-overlay",
  ADJUST_OPACITY: "adjust-opacity",
});

const DEFAULT_RUNTIME = Object.freeze({
  canCapturePointer: false,
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

export function nextMode(mode) {
  return mode === INTERACTION_MODE.ALIGN ? INTERACTION_MODE.TRACE : INTERACTION_MODE.ALIGN;
}

export function isAlignMode(mode) {
  return mode === INTERACTION_MODE.ALIGN;
}

export function isTraceMode(mode) {
  return mode === INTERACTION_MODE.TRACE;
}

export function canEditRegistration(state) {
  return hasOverlayImageSession(state) && isAlignMode(state?.mode);
}

export function canCaptureOverlayPointer({ state, runtime }) {
  return canEditRegistration(state) && !runtime?.isPassThroughActive;
}

export function canTrackOverlayPointer({ state, runtime }) {
  return canCaptureOverlayPointer({ state, runtime });
}

export function isMapPanDragMode(dragMode) {
  return dragMode === DRAG_MODE.MAP_PAN;
}

export function doesDragEditPlacement(dragMode) {
  return dragMode === DRAG_MODE.MOVE_OVERLAY;
}

export function doesWheelEditPlacement(wheelMode) {
  return (
    wheelMode === WHEEL_MODE.ZOOM_OVERLAY ||
    wheelMode === WHEEL_MODE.ROTATE_OVERLAY
  );
}

export function doesWheelEditOpacity(wheelMode) {
  return wheelMode === WHEEL_MODE.ADJUST_OPACITY;
}

export function canHandleWheelGesture({ state, runtime, wheelMode }) {
  if (!hasOverlayImageSession(state) || runtime?.isPassThroughActive) {
    return false;
  }
  if (wheelMode === WHEEL_MODE.ADJUST_OPACITY) {
    return true;
  }
  if (wheelMode === WHEEL_MODE.MAP_ZOOM) {
    return canCaptureOverlayPointer({ state, runtime });
  }
  return canEditRegistration(state) && !runtime?.isPassThroughActive;
}

export function resolveOverlayWheelPolicy({
  state,
  runtime,
  shiftKey,
  altKey,
  ctrlKey,
}) {
  const wheelMode = resolveWheelMode({ shiftKey, altKey, ctrlKey });
  return {
    wheelMode,
    shouldIntercept: (
      wheelMode !== WHEEL_MODE.MAP_ZOOM &&
      canHandleWheelGesture({ state, runtime, wheelMode })
    ),
  };
}

export function canToggleOverlayPin({
  state,
  runtime,
  isPointerOverOverlay,
}) {
  return (
    isPointerOverOverlay &&
    hasOverlayImageSession(state) &&
    canTrackOverlayPointer({ state, runtime })
  );
}

export function resolveOverlayPointerMovePolicy({
  state,
  runtime,
  isPointerOverOverlay,
  buttons = 0,
}) {
  return {
    shouldTrackPointer: (
      isPointerOverOverlay &&
      hasOverlayImageSession(state) &&
      canTrackOverlayPointer({ state, runtime }) &&
      buttons === 0
    ),
  };
}

export function resolveOverlayPointerSequencePolicy({
  state,
  runtime,
  isPointerOverOverlay,
  button = 0,
  shiftKey = false,
}) {
  const shouldOwnPointerSequence = (
    isPointerOverOverlay &&
    hasOverlayImageSession(state) &&
    canCaptureOverlayPointer({ state, runtime }) &&
    button === 0
  );
  return {
    shouldOwnPointerSequence,
    dragMode: shouldOwnPointerSequence ? resolveDragMode({ shiftKey }) : null,
  };
}

export function resolveOverlayActivationPolicy({
  state,
  runtime,
  isPointerOverOverlay,
}) {
  const canTogglePin = canToggleOverlayPin({
    state,
    runtime,
    isPointerOverOverlay,
  });
  return {
    shouldConsumeClick: canTogglePin,
    shouldTogglePin: canTogglePin,
  };
}

export function reduceInteractionRuntime(previousRuntime, action, state) {
  const previous = previousRuntime ?? DEFAULT_RUNTIME;
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

  const normalized = {
    ...next,
    canCapturePointer: canCaptureOverlayPointer({
      state,
      runtime: next,
    }),
  };

  if (
    previous.canCapturePointer === normalized.canCapturePointer &&
    previous.isDragging === normalized.isDragging &&
    previous.isPassThroughActive === normalized.isPassThroughActive &&
    previous.isPointerInsideImage === normalized.isPointerInsideImage &&
    previous.pointerScreenPx?.x === normalized.pointerScreenPx?.x &&
    previous.pointerScreenPx?.y === normalized.pointerScreenPx?.y &&
    previous.dragMode === normalized.dragMode
  ) {
    return previous;
  }

  return normalized;
}

export function createInteractionController({
  store,
  pageAdapter,
  keyTarget = globalThis.window,
  keyboardGateway = null,
}) {
  const logger = createLogger("interactions");
  const runtimeStore = createValueStore(DEFAULT_RUNTIME);
  const eventListeners = new Set();
  let dragState = null;

  const unsubscribeStore = store.subscribe(() => {
    syncRuntimeFromState();
  }, { emitCurrent: false });
  const unsubscribeKeyboardGateway = keyboardGateway?.subscribe?.({
    keydown: handleKeyDown,
    keyup: handleKeyUp,
    blur: handleWindowBlur,
  }) ?? null;
  const keyEventTargets = unsubscribeKeyboardGateway ? [] : resolveKeyEventTargets(keyTarget);

  if (!unsubscribeKeyboardGateway) {
    for (const target of keyEventTargets) {
      target?.addEventListener?.("keydown", handleKeyDown, true);
      target?.addEventListener?.("keyup", handleKeyUp, true);
    }
    keyTarget?.addEventListener?.("blur", handleWindowBlur);
  }

  syncRuntimeFromState();

  function destroy() {
    unsubscribeStore();
    unsubscribeKeyboardGateway?.();
    for (const target of keyEventTargets) {
      target?.removeEventListener?.("keydown", handleKeyDown, true);
      target?.removeEventListener?.("keyup", handleKeyUp, true);
    }
    if (!unsubscribeKeyboardGateway) {
      keyTarget?.removeEventListener?.("blur", handleWindowBlur);
    }
  }

  function subscribe(listener, options) {
    return runtimeStore.subscribe(listener, options);
  }

  function subscribeEvents(listener) {
    eventListeners.add(listener);
    return () => eventListeners.delete(listener);
  }

  function getRuntimeState() {
    return runtimeStore.get();
  }

  function loadImage(image) {
    return runInteractionBoundary("load-image", () => {
      const snapshot = pageAdapter.getSnapshot();
      const placement = createPlacementTransform({
        image,
        centerMapLatLon: snapshot.mapView.center,
        scale: 1,
        rotationRad: 0,
        zoom: snapshot.mapView.zoom,
      });
      store.loadImageSession(image, placement);
      const imageStats = getOverlayImageLoadStats(image);
      logger.info("Loaded image session", {
        ...imageStats,
        centerMapLatLon: snapshot.mapView.center,
      });
      syncRuntimeFromState();
      return true;
    });
  }

  function clearImage() {
    return runInteractionBoundary("clear-image", () => {
      resetInteractionState({
        endPointerScreenPx: runtimeStore.get().pointerScreenPx,
        pointerScreenPx: null,
        isPointerInsideImage: false,
      });
      store.clearImage();
      logger.info("Cleared current image session");
      dispatchRuntime({
        type: INTERACTION_RUNTIME_ACTION.UPDATE_POINTER,
        pointerScreenPx: null,
        isPointerInsideImage: false,
      });
      return true;
    });
  }

  function toggleMode() {
    applyMode(nextMode(store.getState().mode));
  }

  function setMode(mode) {
    applyMode(mode);
  }

  function setOpacity(opacity) {
    store.setOpacity(opacity);
  }

  function computeTransform() {
    return runInteractionBoundary("compute-transform", () => {
      const state = store.getState();
      const solveState = resolveRegistrationSolveState(state.registration);
      if (!solveState.canCompute) {
        const result = createSolveFailureResult(
          SOLVE_RESULT_REASON.INSUFFICIENT_PINS,
          solveState.pinCount,
        );
        emitEvent({
          type: INTERACTION_EVENT.SOLVE_RESULT,
          result,
        });
        logger.warn("Solve requested without enough pins", result);
        return result;
      }

      const solvedTransform = solveSimilarityTransform(state.registration.pins);
      if (!solvedTransform) {
        const result = createSolveFailureResult(
          SOLVE_RESULT_REASON.SOLVE_FAILED,
          solveState.pinCount,
        );
        emitEvent({
          type: INTERACTION_EVENT.SOLVE_RESULT,
          result,
        });
        logger.warn("Solve requested but transform computation failed", result);
        return result;
      }

      store.setSolvedTransform(solvedTransform);
      const result = createSolveSuccessResult(solvedTransform, solveState.pinCount);
      emitEvent({
        type: INTERACTION_EVENT.SOLVE_RESULT,
        result,
      });
      logger.info("Computed registration transform", {
        pinCount: result.pinCount,
        scale: solvedTransform.scale,
        rotationRad: solvedTransform.rotationRad,
      });
      syncRuntimeFromState();
      return result;
    });
  }

  function requestTogglePinAtCurrentPointer() {
    const result = togglePinAtCurrentPointer();
    emitEvent({
      type: INTERACTION_EVENT.PIN_RESULT,
      result,
    });
    return result;
  }

  function togglePinAtCurrentPointer() {
    const pinContext = resolvePinContext({
      state: store.getState(),
      runtime: runtimeStore.get(),
      pageAdapter,
    });
    if (!pinContext.ok) {
      logger.warn("Pin toggle requested without a valid pin context", {
        reason: pinContext.reason,
      });
      return pinContext;
    }

    return preserveRenderedPlacementForRegistrationEdit(() => {
      if (pinContext.existingPin) {
        store.removePin(pinContext.existingPin.id);
        logger.info("Removed registration pin", {
          pinId: pinContext.existingPin.id,
        });
        dispatchRuntime({
          type: INTERACTION_RUNTIME_ACTION.UPDATE_POINTER,
          pointerScreenPx: pinContext.pointerScreenPx,
          isPointerInsideImage: true,
        });
        return {
          ...createPinSuccessResult(PIN_RESULT_ACTION.REMOVED, pinContext.existingPin),
        };
      }

      const pin = store.addPin({
        imagePx: pinContext.imagePx,
        mapLatLon: pinContext.mapLatLon,
      });
      logger.info("Added registration pin", {
        pinId: pin?.id ?? null,
        imagePx: pinContext.imagePx,
        mapLatLon: pinContext.mapLatLon,
      });
      dispatchRuntime({
        type: INTERACTION_RUNTIME_ACTION.UPDATE_POINTER,
        pointerScreenPx: pinContext.pointerScreenPx,
        isPointerInsideImage: true,
      });
      return {
        ...createPinSuccessResult(PIN_RESULT_ACTION.ADDED, pin),
      };
    });
  }

  function clearPins() {
    return runInteractionBoundary("clear-pins", () => {
      preserveRenderedPlacementForRegistrationEdit(() => {
        const changed = store.clearPins();
        if (!changed) {
          return;
        }
        logger.info("Cleared registration pins");
        emitEvent({
          type: INTERACTION_EVENT.PINS_CLEARED,
        });
        syncRuntimeFromState();
      });
      return true;
    });
  }

  function handlePointerEnter(screenPoint) {
    updatePointer(screenPoint, { isPointerInsideImage: true });
  }

  function handlePointerLeave() {
    if (runtimeStore.get().isDragging) {
      return;
    }
    updatePointer(null, { isPointerInsideImage: false });
  }

  function handlePointerMove(screenPoint) {
    return runInteractionBoundary("handle-pointer-move", () => {
      const runtime = runtimeStore.get();
      if (runtime.isDragging && dragState) {
        dragTo(screenPoint);
        startDragRuntime(screenPoint, {
          isPointerInsideImage: true,
          dragMode: dragState.mode,
        });
        return true;
      }
      updatePointer(screenPoint, { isPointerInsideImage: true });
      return true;
    }, { fallbackValue: false });
  }

  function handlePointerDown({ button, screenPoint, shiftKey, dragMode: explicitDragMode = null }) {
    return runInteractionBoundary("handle-pointer-down", () => {
      if (button !== 0 || !runtimeStore.get().canCapturePointer) {
        return false;
      }

      const state = store.getState();
      if (!hasOverlayImageSession(state)) {
        return false;
      }

      const dragMode = explicitDragMode ?? resolveDragMode({ shiftKey });
      if (isMapPanDragMode(dragMode)) {
        const beganMapPan = pageAdapter.beginMapPan?.(screenPoint) === true;
        if (!beganMapPan) {
          logger.warn("Map pan requested, but the page adapter could not start it");
          return false;
        }
        dragState = {
          mode: DRAG_MODE.MAP_PAN,
          lastPointerScreenPx: screenPoint,
        };
      } else {
        const interactionState = syncPlacementBaselineToCurrentRenderTransform(state);
        const image = getOverlayImage(interactionState);
        const snapshot = pageAdapter.getSnapshot();
        const screenTransform = resolveOverlayScreenTransform({
          state: interactionState,
          snapshot,
        });
        const centerScreenPx = imagePointToScreenPoint({
          imagePoint: {
            x: image.width / 2,
            y: image.height / 2,
          },
          transform: screenTransform,
        });
        dragState = {
          mode: DRAG_MODE.MOVE_OVERLAY,
          startPointerScreenPx: screenPoint,
          startCenterScreenPx: centerScreenPx,
        };
      }
      startDragRuntime(screenPoint, {
        isPointerInsideImage: true,
        dragMode,
      });
      return true;
    }, { fallbackValue: false });
  }

  function handlePointerUp(screenPoint) {
    return runInteractionBoundary("handle-pointer-up", () => {
      if (!dragState) {
        return false;
      }
      dragTo(screenPoint);
      if (isMapPanDragMode(dragState.mode)) {
        pageAdapter.endMapPan?.(screenPoint);
      }
      dragState = null;
      endDragRuntime(screenPoint, {
        isPointerInsideImage: true,
      });
      return true;
    }, { fallbackValue: false });
  }

  function handlePointerCancel() {
    return runInteractionBoundary("handle-pointer-cancel", () => {
      resetInteractionState({
        endPointerScreenPx: runtimeStore.get().pointerScreenPx,
        pointerScreenPx: null,
        isPointerInsideImage: false,
      });
      return true;
    });
  }

  function handleWheel({ deltaY, shiftKey, altKey, ctrlKey, screenPoint }) {
    return runInteractionBoundary("handle-wheel", () => {
      const state = store.getState();
      const runtime = runtimeStore.get();
      if (!hasOverlayImageSession(state)) {
        return false;
      }

      const wheelMode = resolveWheelMode({ shiftKey, altKey, ctrlKey });
      if (!canHandleWheelGesture({ state, runtime, wheelMode })) {
        return false;
      }
      if (wheelMode === WHEEL_MODE.MAP_ZOOM) {
        const scaleFactor = scaleFromWheelDelta(1, deltaY);
        const forwarded = pageAdapter.forwardMapZoom({
          screenPoint,
          deltaY,
        });
        if (!forwarded) {
          logger.warn("Map zoom requested, but the page adapter could not forward it");
          return false;
        }
        logger.info(
          "Forwarded native wheel to map zoom; overlay follows through the current render state",
          {
            forwarded,
            scaleFactor,
            deltaY,
            renderSource: resolveOverlayRenderSource(state),
          },
        );
        updatePointer(screenPoint, { isPointerInsideImage: true });
        return true;
      }

      if (wheelMode === WHEEL_MODE.ADJUST_OPACITY) {
        const nextOpacity = opacityFromWheelDelta(state.opacity, deltaY);
        store.setOpacity(nextOpacity);
        logger.info("Adjusted overlay opacity", { opacity: nextOpacity, deltaY });
        updatePointer(screenPoint, { isPointerInsideImage: true });
        return true;
      }

      const placementState = syncPlacementBaselineToCurrentRenderTransform(state);
      const snapshot = pageAdapter.getSnapshot();
      if (wheelMode === WHEEL_MODE.ROTATE_OVERLAY) {
        const nextRotationRad = rotationFromWheelDelta(placementState.placement.rotationRad, deltaY);
        const nextPlacement = createRetunedPlacementTransform({
          state: placementState,
          snapshot,
          rotationRad: nextRotationRad,
        });
        store.setPlacement(nextPlacement);
        logger.info("Rotated overlay placement", { rotationRad: nextRotationRad, deltaY });
      } else if (wheelMode === WHEEL_MODE.ZOOM_OVERLAY) {
        const screenScale = Math.hypot(placementState.placement.a, placementState.placement.b) * (2 ** snapshot.mapView.zoom);
        const nextScale = scaleFromWheelDelta(screenScale, deltaY);
        const nextPlacement = createRetunedPlacementTransform({
          state: placementState,
          snapshot,
          screenScale: nextScale,
        });
        store.setPlacement(nextPlacement);
        logger.info("Scaled overlay placement", { scale: nextScale, deltaY });
      }
      updatePointer(screenPoint, { isPointerInsideImage: true });
      return true;
    }, { fallbackValue: false });
  }

  function handleDoubleClick(screenPoint) {
    return runInteractionBoundary("handle-double-click", () => {
      updatePointer(screenPoint, { isPointerInsideImage: true });
      return requestTogglePinAtCurrentPointer();
    }, { fallbackValue: createPinFailureResult(PIN_RESULT_REASON.NO_POINTER) });
  }

  function handleKeyDown(event) {
    const state = store.getState();
    if (!hasOverlayImageSession(state)) {
      return;
    }

    const shortcutAction = resolveKeyboardShortcut({
      event,
      state,
    });
    if (!shortcutAction) {
      if (!shouldIgnoreKeyboardShortcut(event)) {
        logger.debug("Ignoring keydown because it is not an overlay shortcut", {
          code: event.code,
          mode: state.mode,
        });
      } else {
        logger.debug("Ignoring keyboard shortcut because the focused target is editable", {
          code: event.code,
        });
      }
      return;
    }

    consumeEvent(event);

    if (shortcutAction === KEYBOARD_SHORTCUT_ACTION.TOGGLE_PIN_CURRENT_POINTER) {
      logger.info("Keyboard pin toggle requested", {
        pointerScreenPx: runtimeStore.get().pointerScreenPx,
      });
      requestTogglePinAtCurrentPointer();
      return;
    }

    if (shortcutAction === KEYBOARD_SHORTCUT_ACTION.SWITCH_TO_TRACE) {
      logger.info("Keyboard trace escape requested");
      applyMode(INTERACTION_MODE.TRACE);
      return;
    }

    if (shortcutAction === KEYBOARD_SHORTCUT_ACTION.ENABLE_PASS_THROUGH) {
      logger.info("Keyboard pass-through activated");
      setPassThrough(true);
    }
  }

  function handleKeyUp(event) {
    if (!shouldReleasePassThrough({
      event,
      state: store.getState(),
      runtime: runtimeStore.get(),
    })) {
      logger.debug("Ignoring keyup because pass-through is not active for this event", {
        code: event.code,
      });
      return;
    }
    consumeEvent(event);
    logger.info("Keyboard pass-through released");
    setPassThrough(false);
  }

  function handleWindowBlur() {
    resetInteractionState({
      endPointerScreenPx: runtimeStore.get().pointerScreenPx,
      pointerScreenPx: null,
      isPointerInsideImage: false,
    });
  }

  function dragTo(screenPoint) {
    if (!dragState) {
      return;
    }

    if (isMapPanDragMode(dragState.mode)) {
      dragState.lastPointerScreenPx = screenPoint;
      pageAdapter.updateMapPan(screenPoint);
      return;
    }

    const nextCenterScreenPx = {
      x: dragState.startCenterScreenPx.x + (screenPoint.x - dragState.startPointerScreenPx.x),
      y: dragState.startCenterScreenPx.y + (screenPoint.y - dragState.startPointerScreenPx.y),
    };
    const state = syncPlacementBaselineToCurrentRenderTransform(store.getState());
    const snapshot = pageAdapter.getSnapshot();
    const nextPlacement = createRetunedPlacementTransform({
      state,
      snapshot,
      centerScreenPx: nextCenterScreenPx,
    });
    store.setPlacement(nextPlacement);
  }

  function syncPlacementBaselineToCurrentRenderTransform(state = store.getState()) {
    const nextPlacement = derivePlacementFromCurrentRenderTransform(state);
    if (!nextPlacement) {
      return state;
    }
    store.syncPlacement(nextPlacement);
    return store.getState();
  }

  function preserveRenderedPlacementForRegistrationEdit(mutateRegistration) {
    syncPlacementBaselineToCurrentRenderTransform();
    return mutateRegistration();
  }

  function derivePlacementFromCurrentRenderTransform(state) {
    if (!hasOverlayImageSession(state) || !hasCleanSolvedTransform(state.registration)) {
      return null;
    }
    const snapshot = pageAdapter.getSnapshot();
    const transform = resolveOverlayScreenTransform({
      state,
      snapshot,
    });
    return derivePlacementFromScreenTransform({
      snapshot,
      transform,
    });
  }

  function updatePointer(pointerScreenPx, { isPointerInsideImage }) {
    dispatchRuntime({
      type: INTERACTION_RUNTIME_ACTION.UPDATE_POINTER,
      pointerScreenPx,
      isPointerInsideImage,
    });
  }

  function startDragRuntime(pointerScreenPx, { isPointerInsideImage, dragMode }) {
    dispatchRuntime({
      type: INTERACTION_RUNTIME_ACTION.START_DRAG,
      pointerScreenPx,
      isPointerInsideImage,
      dragMode,
    });
  }

  function endDragRuntime(pointerScreenPx, { isPointerInsideImage }) {
    dispatchRuntime({
      type: INTERACTION_RUNTIME_ACTION.END_DRAG,
      pointerScreenPx,
      isPointerInsideImage,
    });
  }

  function setPassThrough(isActive) {
    dispatchRuntime({
      type: INTERACTION_RUNTIME_ACTION.SET_PASS_THROUGH,
      isActive,
    });
  }

  function syncRuntimeFromState() {
    dispatchRuntime({
      type: INTERACTION_RUNTIME_ACTION.SYNC_FROM_STATE,
    });
  }

  function dispatchRuntime(action) {
    runtimeStore.set(
      reduceInteractionRuntime(runtimeStore.get(), action, store.getState()),
    );
  }

  function applyMode(mode) {
    return runInteractionBoundary("apply-mode", () => {
      const state = store.getState();
      if (mode === INTERACTION_MODE.TRACE && needsSolveRecompute(state.registration)) {
        computeTransform();
      }
      resetInteractionState({
        pointerScreenPx: runtimeStore.get().pointerScreenPx,
        isPointerInsideImage: runtimeStore.get().isPointerInsideImage,
      });
      store.setMode(mode);
      logger.info("Switched mode", { mode });
      syncRuntimeFromState();
      return true;
    });
  }

  function resetInteractionState({
    endPointerScreenPx = runtimeStore.get().pointerScreenPx,
    pointerScreenPx = runtimeStore.get().pointerScreenPx,
    isPointerInsideImage = runtimeStore.get().isPointerInsideImage,
  } = {}) {
    if (isMapPanDragMode(dragState?.mode)) {
      pageAdapter.endMapPan?.(endPointerScreenPx);
    }
    dragState = null;
    dispatchRuntime({
      type: INTERACTION_RUNTIME_ACTION.RESET,
      pointerScreenPx,
      isPointerInsideImage,
    });
  }

  function emitEvent(event) {
    for (const listener of eventListeners) {
      listener(event);
    }
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
        pointerScreenPx: runtimeStore.get().pointerScreenPx,
        isPointerInsideImage: runtimeStore.get().isPointerInsideImage,
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
    emitEvent({
      type: INTERACTION_EVENT.RUNTIME_ERROR,
      error: runtimeError,
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
    subscribeEvents,
    getRuntimeState,
    loadImage,
    clearImage,
    toggleMode,
    setMode,
    setOpacity,
    computeTransform,
    clearPins,
    handlePointerEnter,
    handlePointerLeave,
    handlePointerMove,
    handlePointerDown,
    handlePointerUp,
    handlePointerCancel,
    handleWheel,
    handleDoubleClick,
    requestTogglePinAtCurrentPointer,
    reportRuntimeError,
  };
}

function createRetunedPlacementTransform({
  state,
  snapshot,
  centerScreenPx = null,
  screenScale = null,
  rotationRad = null,
}) {
  const image = getOverlayImage(state);
  const screenTransform = resolveOverlayScreenTransform({
    state,
    snapshot,
  });
  const imageCenter = {
    x: image.width / 2,
    y: image.height / 2,
  };
  const resolvedCenterScreenPx = centerScreenPx ?? imagePointToScreenPoint({
    imagePoint: imageCenter,
    transform: screenTransform,
  });
  const resolvedScreenScale = screenScale ?? Math.hypot(screenTransform.a, screenTransform.b);
  const resolvedRotationRad = rotationRad ?? Math.atan2(screenTransform.b, screenTransform.a);
  return derivePlacementFromScreenTransform({
    snapshot,
    transform: createSimilarityTransformFromAnchor({
      anchorImagePx: imageCenter,
      anchorTargetPx: resolvedCenterScreenPx,
      scale: resolvedScreenScale,
      rotationRad: resolvedRotationRad,
    }),
  });
}

export function resolveDragMode({ shiftKey }) {
  if (shiftKey) {
    return DRAG_MODE.MOVE_OVERLAY;
  }
  return DRAG_MODE.MAP_PAN;
}

export function resolveWheelMode({ shiftKey, altKey, ctrlKey }) {
  if (altKey) {
    return WHEEL_MODE.ADJUST_OPACITY;
  }
  if (ctrlKey) {
    return WHEEL_MODE.ROTATE_OVERLAY;
  }
  if (shiftKey) {
    return WHEEL_MODE.ZOOM_OVERLAY;
  }
  return WHEEL_MODE.MAP_ZOOM;
}

function consumeEvent(event) {
  event.preventDefault?.();
  event.stopPropagation?.();
  event.stopImmediatePropagation?.();
}

export function shouldIgnoreKeyboardShortcut(event) {
  if (event.defaultPrevented) {
    return true;
  }
  if (event.metaKey || event.ctrlKey || event.altKey) {
    return true;
  }
  const target = event.composedPath?.()[0] ?? event.target ?? null;
  return isEditableTarget(target);
}

export function resolveKeyboardShortcut({ event, state }) {
  if (shouldIgnoreKeyboardShortcut(event)) {
    return null;
  }
  if (!canEditRegistration(state)) {
    return null;
  }
  if (event.code === "KeyP") {
    return KEYBOARD_SHORTCUT_ACTION.TOGGLE_PIN_CURRENT_POINTER;
  }
  if (event.code === "Escape") {
    return KEYBOARD_SHORTCUT_ACTION.SWITCH_TO_TRACE;
  }
  if (event.code === "Space") {
    return KEYBOARD_SHORTCUT_ACTION.ENABLE_PASS_THROUGH;
  }
  return null;
}

export function shouldReleasePassThrough({ event, state, runtime }) {
  return (
    event.code === "Space" &&
    (isAlignMode(state.mode) || runtime.isPassThroughActive)
  );
}

export function resolvePinContext({ state, runtime, pageAdapter }) {
  if (!canEditRegistration(state)) {
    return createPinFailureResult(
      hasOverlayImageSession(state) ? PIN_RESULT_REASON.NOT_ALIGN_MODE : PIN_RESULT_REASON.NO_IMAGE,
    );
  }
  const pointerScreenPx = runtime.pointerScreenPx;
  if (!pointerScreenPx) {
    return createPinFailureResult(PIN_RESULT_REASON.NO_POINTER);
  }

  const snapshot = pageAdapter.getSnapshot();
  const currentTransform = resolveOverlayScreenTransform({
    state,
    snapshot,
  });
  const imagePx = screenPointToRenderedImagePoint({
    screenPoint: pointerScreenPx,
    transform: currentTransform,
    snapshot,
  });
  const image = getOverlayImage(state);
  if (!isImagePointWithinBounds(imagePx, image)) {
    return createPinFailureResult(PIN_RESULT_REASON.POINTER_OUTSIDE_IMAGE, {
      pointerScreenPx,
      imagePx,
    });
  }

  const renderedPins = buildPinRenderModels({
    pins: state.registration.pins,
    transform: currentTransform,
    projectScreenPoint: (pinImagePx) => imagePointToRenderedScreenPoint({
      imagePoint: pinImagePx,
      transform: currentTransform,
      snapshot,
    }),
  });
  const existingPin = hitTestPin({
    screenPoint: pointerScreenPx,
    renderedPins,
  });

  return {
    ok: true,
    pointerScreenPx,
    imagePx,
    mapLatLon: pageAdapter.screenToMap(pointerScreenPx),
    existingPin,
  };
}

function createPinSuccessResult(action, pin) {
  return {
    ok: true,
    action,
    pin,
  };
}

function createPinFailureResult(reason, extra = {}) {
  return {
    ok: false,
    reason,
    ...extra,
  };
}

function createSolveSuccessResult(solvedTransform, pinCount) {
  return {
    ok: true,
    solvedTransform,
    pinCount,
  };
}

function createSolveFailureResult(reason, pinCount) {
  return {
    ok: false,
    reason,
    pinCount,
  };
}

function isEditableTarget(target) {
  if (!target || typeof target !== "object") {
    return false;
  }
  if (target.isContentEditable) {
    return true;
  }
  const tagName = typeof target.tagName === "string" ? target.tagName.toUpperCase() : "";
  if (tagName === "TEXTAREA" || tagName === "SELECT") {
    return true;
  }
  if (tagName !== "INPUT") {
    return false;
  }
  const type = typeof target.type === "string" ? target.type.toLowerCase() : "";
  return !["button", "range", "checkbox", "radio", "submit", "reset"].includes(type);
}

function resolveKeyEventTargets(keyTarget) {
  const targets = [];
  if (keyTarget) {
    targets.push(keyTarget);
    const documentTarget = keyTarget.document;
    if (documentTarget && documentTarget !== keyTarget) {
      targets.push(documentTarget);
    }
  }
  return targets;
}
