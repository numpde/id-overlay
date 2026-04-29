import { createValueStore } from "./value-store.js";
import { createLogger } from "./logger.js";
import {
  hasCleanSolvedTransform,
  needsSolveRecompute,
  resolveRegistrationSolveState,
} from "./state.js";
import {
  buildPinRenderModels,
  createPlacementTransform,
  createSimilarityTransformFromAnchor,
  derivePlacementFromScreenTransform,
  hitTestPin,
  imagePointToScreenPoint,
  isImagePointWithinBounds,
  resolveOverlayRenderSource,
  resolveOverlayScreenTransform,
  rotationFromWheelDelta,
  scaleFromWheelDelta,
  screenPointToImagePoint,
  solveSimilarityTransform,
} from "./transform.js";

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
});

export const DRAG_MODE = Object.freeze({
  MOVE_OVERLAY: "move-overlay",
  SHARED_PAN: "shared-pan",
});

export const WHEEL_MODE = Object.freeze({
  ZOOM_BOTH: "zoom-both",
  ZOOM_OVERLAY: "zoom-overlay",
  ROTATE_OVERLAY: "rotate-overlay",
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
  return Boolean(state?.image) && isAlignMode(state?.mode);
}

export function canCaptureOverlayPointer({ state, runtime }) {
  return canEditRegistration(state) && !runtime?.isPassThroughActive;
}

export function isSharedDragMode(dragMode) {
  return dragMode === DRAG_MODE.SHARED_PAN;
}

export function doesDragEditPlacement(dragMode) {
  return dragMode === DRAG_MODE.MOVE_OVERLAY;
}

export function doesWheelEditPlacement(wheelMode) {
  return wheelMode !== WHEEL_MODE.ZOOM_BOTH;
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

  return {
    ...next,
    canCapturePointer: canCaptureOverlayPointer({
      state,
      runtime: next,
    }),
  };
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
    const snapshot = pageAdapter.getSnapshot();
    const placement = createPlacementTransform({
      image,
      centerMapLatLon: snapshot.mapView.center,
      scale: 1,
      rotationRad: 0,
      zoom: snapshot.mapView.zoom,
    });
    store.loadImageSession(image, placement);
    logger.info("Loaded image session", {
      width: image.width,
      height: image.height,
      centerMapLatLon: snapshot.mapView.center,
    });
    syncRuntimeFromState();
  }

  function clearImage() {
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
  }

  function toggleMode() {
    applyMode(nextMode(store.getState().mode));
  }

  function setOpacity(opacity) {
    store.setOpacity(opacity);
  }

  function computeTransform() {
    const state = store.getState();
    const solveState = resolveRegistrationSolveState(state.registration);
    if (!solveState.canCompute) {
      const result = {
        ok: false,
        reason: "insufficient-pins",
        pinCount: solveState.pinCount,
      };
      emitEvent({
        type: INTERACTION_EVENT.SOLVE_RESULT,
        result,
      });
      logger.warn("Solve requested without enough pins", result);
      return result;
    }

    const solvedTransform = solveSimilarityTransform(state.registration.pins);
    if (!solvedTransform) {
      const result = {
        ok: false,
        reason: "solve-failed",
        pinCount: solveState.pinCount,
      };
      emitEvent({
        type: INTERACTION_EVENT.SOLVE_RESULT,
        result,
      });
      logger.warn("Solve requested but transform computation failed", result);
      return result;
    }

    store.setSolvedTransform(solvedTransform);
    const result = {
      ok: true,
      solvedTransform,
      pinCount: solveState.pinCount,
    };
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
          ok: true,
          action: "removed",
          pin: pinContext.existingPin,
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
        ok: true,
        action: "added",
        pin,
      };
    });
  }

  function clearPins() {
    preserveRenderedPlacementForRegistrationEdit(() => {
      store.clearPins();
      logger.info("Cleared registration pins");
      emitEvent({
        type: INTERACTION_EVENT.PINS_CLEARED,
      });
      syncRuntimeFromState();
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
    const runtime = runtimeStore.get();
    if (runtime.isDragging && dragState) {
      dragTo(screenPoint);
      startDragRuntime(screenPoint, {
        isPointerInsideImage: true,
        dragMode: dragState.mode,
      });
      return;
    }
    updatePointer(screenPoint, { isPointerInsideImage: true });
  }

  function handlePointerDown({ button, screenPoint, shiftKey }) {
    if (button !== 0 || !runtimeStore.get().canCapturePointer) {
      return false;
    }

    const state = store.getState();
    if (!state.image) {
      return false;
    }

    const dragMode = resolveDragMode({ shiftKey });
    if (isSharedDragMode(dragMode)) {
      const beganSharedDrag = pageAdapter.beginSharedDrag?.(screenPoint) === true;
      if (!beganSharedDrag) {
        logger.warn("Shared drag requested, but the page adapter could not start it");
        return false;
      }
      dragState = {
        mode: DRAG_MODE.SHARED_PAN,
        lastPointerScreenPx: screenPoint,
      };
    } else {
      const interactionState = syncPlacementBaselineToCurrentRenderTransform(state);
      const snapshot = pageAdapter.getSnapshot();
      const screenTransform = resolveOverlayScreenTransform({
        state: interactionState,
        snapshot,
      });
      const centerScreenPx = imagePointToScreenPoint({
        imagePoint: {
          x: interactionState.image.width / 2,
          y: interactionState.image.height / 2,
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
  }

  function handlePointerUp(screenPoint) {
    if (!dragState) {
      return;
    }
    dragTo(screenPoint);
    if (isSharedDragMode(dragState.mode)) {
      pageAdapter.endSharedDrag?.(screenPoint);
    }
    dragState = null;
    endDragRuntime(screenPoint, {
      isPointerInsideImage: true,
    });
  }

  function handlePointerCancel() {
    resetInteractionState({
      endPointerScreenPx: runtimeStore.get().pointerScreenPx,
      pointerScreenPx: null,
      isPointerInsideImage: false,
    });
  }

  function handleWheel({ deltaY, shiftKey, altKey, screenPoint }) {
    if (!runtimeStore.get().canCapturePointer) {
      return false;
    }
    if (!store.getState().image) {
      return false;
    }

    const wheelMode = resolveWheelMode({ shiftKey, altKey });
    if (wheelMode === WHEEL_MODE.ZOOM_BOTH) {
      const state = store.getState();
      const scaleFactor = scaleFromWheelDelta(1, deltaY);
      const forwarded = pageAdapter.forwardSharedWheel({
        screenPoint,
        deltaY,
      });
      if (!forwarded) {
        logger.warn("Shared wheel requested, but the page adapter could not forward it");
        return false;
      }
      logger.info(
        "Forwarded native wheel to map; overlay follows through shared render state",
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

    const state = syncPlacementBaselineToCurrentRenderTransform(store.getState());
    const snapshot = pageAdapter.getSnapshot();
    if (wheelMode === WHEEL_MODE.ROTATE_OVERLAY) {
      const nextRotationRad = rotationFromWheelDelta(state.placement.rotationRad, deltaY);
      const nextPlacement = createRetunedPlacementTransform({
        state,
        snapshot,
        rotationRad: nextRotationRad,
      });
      store.setPlacement(nextPlacement);
      logger.info("Rotated overlay placement", { rotationRad: nextRotationRad, deltaY });
    } else {
      const screenScale = Math.hypot(state.placement.a, state.placement.b) * (2 ** snapshot.mapView.zoom);
      const nextScale = scaleFromWheelDelta(screenScale, deltaY);
      const nextPlacement = createRetunedPlacementTransform({
        state,
        snapshot,
        screenScale: nextScale,
      });
      store.setPlacement(nextPlacement);
      logger.info("Scaled overlay placement", { scale: nextScale, deltaY });
    }
    updatePointer(screenPoint, { isPointerInsideImage: true });
    return true;
  }

  function handleDoubleClick(screenPoint) {
    updatePointer(screenPoint, { isPointerInsideImage: true });
    return requestTogglePinAtCurrentPointer();
  }

  function handleKeyDown(event) {
    const state = store.getState();
    if (!state.image) {
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

    if (isSharedDragMode(dragState.mode)) {
      const delta = {
        x: screenPoint.x - dragState.lastPointerScreenPx.x,
        y: screenPoint.y - dragState.lastPointerScreenPx.y,
      };
      dragState.lastPointerScreenPx = screenPoint;
      pageAdapter.updateSharedDrag(screenPoint, delta);
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
    if (!state.image || !hasCleanSolvedTransform(state.registration)) {
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
  }

  function resetInteractionState({
    endPointerScreenPx = runtimeStore.get().pointerScreenPx,
    pointerScreenPx = runtimeStore.get().pointerScreenPx,
    isPointerInsideImage = runtimeStore.get().isPointerInsideImage,
  } = {}) {
    if (isSharedDragMode(dragState?.mode)) {
      pageAdapter.endSharedDrag?.(endPointerScreenPx);
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

  return {
    destroy,
    subscribe,
    subscribeEvents,
    getRuntimeState,
    loadImage,
    clearImage,
    toggleMode,
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
  };
}

function createRetunedPlacementTransform({
  state,
  snapshot,
  centerScreenPx = null,
  screenScale = null,
  rotationRad = null,
}) {
  const screenTransform = resolveOverlayScreenTransform({
    state,
    snapshot,
  });
  const imageCenter = {
    x: state.image.width / 2,
    y: state.image.height / 2,
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
  return DRAG_MODE.SHARED_PAN;
}

export function resolveWheelMode({ shiftKey, altKey }) {
  if (altKey) {
    return WHEEL_MODE.ROTATE_OVERLAY;
  }
  if (shiftKey) {
    return WHEEL_MODE.ZOOM_OVERLAY;
  }
  return WHEEL_MODE.ZOOM_BOTH;
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
    return {
      ok: false,
      reason: state?.image ? "not-align-mode" : "no-image",
    };
  }
  const pointerScreenPx = runtime.pointerScreenPx;
  if (!pointerScreenPx) {
    return { ok: false, reason: "no-pointer" };
  }

  const snapshot = pageAdapter.getSnapshot();
  const currentTransform = resolveOverlayScreenTransform({
    state,
    snapshot,
    mapToScreen: pageAdapter.mapToScreen,
  });
  const imagePx = screenPointToImagePoint({
    screenPoint: pointerScreenPx,
    transform: currentTransform,
  });
  if (!isImagePointWithinBounds(imagePx, state.image)) {
    return {
      ok: false,
      reason: "pointer-outside-image",
      pointerScreenPx,
      imagePx,
    };
  }

  const renderedPins = buildPinRenderModels({
    pins: state.registration.pins,
    transform: currentTransform,
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
