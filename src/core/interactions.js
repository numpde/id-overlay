import { createValueStore } from "./value-store.js";
import { createLogger } from "./logger.js";
import {
  canSolveRegistration,
  getRegistrationPinCount,
  hasCleanSolvedTransform,
  needsSolveRecompute,
} from "./state.js";
import {
  buildPinRenderModels,
  derivePlacementFromScreenTransform,
  hitTestPin,
  isImagePointWithinBounds,
  resolveOverlayScreenTransform,
  resolvePlacementCenterMapLatLon,
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

const DRAG_MODE = Object.freeze({
  MOVE_OVERLAY: "move-overlay",
  SHARED_PAN: "shared-pan",
});

const DEFAULT_RUNTIME = Object.freeze({
  canCapturePointer: false,
  canComputeTransform: false,
  isDragging: false,
  isPassThroughActive: false,
  isPointerInsideImage: false,
  pointerScreenPx: null,
  dragMode: null,
});

export function nextMode(mode) {
  return mode === INTERACTION_MODE.ALIGN ? INTERACTION_MODE.TRACE : INTERACTION_MODE.ALIGN;
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
    syncRuntime();
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

  syncRuntime();

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
    const mapCenter = pageAdapter.getMapCenter();
    store.loadImageSession(image, mapCenter);
    logger.info("Loaded image session", {
      width: image.width,
      height: image.height,
      centerMapLatLon: mapCenter,
    });
    syncRuntime();
  }

  function clearImage() {
    dragState = null;
    store.clearImage();
    logger.info("Cleared current image session");
    syncRuntime({
      isDragging: false,
      isPointerInsideImage: false,
      isPassThroughActive: false,
      pointerScreenPx: null,
      dragMode: null,
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
    const pinCount = getRegistrationPinCount(state.registration);
    if (!canSolveRegistration(state.registration)) {
      const result = {
        ok: false,
        reason: "insufficient-pins",
        pinCount,
      };
      emitEvent({
        type: "solve-result",
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
        pinCount,
      };
      emitEvent({
        type: "solve-result",
        result,
      });
      logger.warn("Solve requested but transform computation failed", result);
      return result;
    }

    store.setSolvedTransform(solvedTransform);
    const result = {
      ok: true,
      solvedTransform,
      pinCount,
    };
    emitEvent({
      type: "solve-result",
      result,
    });
    logger.info("Computed registration transform", {
      pinCount: result.pinCount,
      scale: solvedTransform.scale,
      rotationRad: solvedTransform.rotationRad,
    });
    syncRuntime();
    return result;
  }

  function requestTogglePinAtCurrentPointer() {
    const result = togglePinAtCurrentPointer();
    emitEvent({
      type: "pin-result",
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

    if (pinContext.existingPin) {
      store.removePin(pinContext.existingPin.id);
      logger.info("Removed registration pin", {
        pinId: pinContext.existingPin.id,
      });
      syncRuntime({
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
    syncRuntime({
      pointerScreenPx: pinContext.pointerScreenPx,
      isPointerInsideImage: true,
    });
    return {
      ok: true,
      action: "added",
      pin,
    };
  }

  function clearPins() {
    store.clearPins();
    logger.info("Cleared registration pins");
    emitEvent({
      type: "pins-cleared",
    });
    syncRuntime();
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
      updatePointer(screenPoint, {
        isPointerInsideImage: true,
        isDragging: true,
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

    const interactionState = syncPlacementToCurrentRenderTransform(state);
    const snapshot = pageAdapter.getSnapshot();
    const centerScreenPx = pageAdapter.mapToScreen(
      resolvePlacementCenterMapLatLon(snapshot, interactionState.placement),
    );
    dragState = shiftKey && typeof pageAdapter.panMapByScreenDelta === "function"
      ? {
          mode: DRAG_MODE.SHARED_PAN,
          lastPointerScreenPx: screenPoint,
        }
      : {
          mode: DRAG_MODE.MOVE_OVERLAY,
          startPointerScreenPx: screenPoint,
          startCenterScreenPx: centerScreenPx,
        };
    updatePointer(screenPoint, {
      isPointerInsideImage: true,
      isDragging: true,
      dragMode: dragState.mode,
    });
    return true;
  }

  function handlePointerUp(screenPoint) {
    if (!dragState) {
      return;
    }
    dragTo(screenPoint);
    dragState = null;
    updatePointer(screenPoint, {
      isPointerInsideImage: true,
      isDragging: false,
      dragMode: null,
    });
  }

  function handlePointerCancel() {
    dragState = null;
    syncRuntime({
      isDragging: false,
      dragMode: null,
    });
  }

  function handleWheel({ deltaY, shiftKey, screenPoint }) {
    if (!runtimeStore.get().canCapturePointer) {
      return false;
    }
    if (!store.getState().image) {
      return false;
    }

    const state = syncPlacementToCurrentRenderTransform(store.getState());
    if (shiftKey) {
      const rotationRad = rotationFromWheelDelta(state.placement.rotationRad, deltaY);
      store.patchPlacement({
        rotationRad,
      });
      logger.info("Rotated overlay placement", { rotationRad, deltaY });
    } else {
      const scale = scaleFromWheelDelta(state.placement.scale, deltaY);
      store.patchPlacement({
        scale,
      });
      logger.info("Scaled overlay placement", { scale, deltaY });
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
      syncRuntime({
        isPassThroughActive: true,
      });
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
    syncRuntime({
      isPassThroughActive: false,
    });
  }

  function handleWindowBlur() {
    syncRuntime({
      isPassThroughActive: false,
      isDragging: false,
      dragMode: null,
    });
    dragState = null;
  }

  function dragTo(screenPoint) {
    if (!dragState) {
      return;
    }

    if (dragState.mode === DRAG_MODE.SHARED_PAN) {
      const delta = {
        x: screenPoint.x - dragState.lastPointerScreenPx.x,
        y: screenPoint.y - dragState.lastPointerScreenPx.y,
      };
      dragState.lastPointerScreenPx = screenPoint;
      pageAdapter.panMapByScreenDelta?.(delta);
      return;
    }

    const nextCenterScreenPx = {
      x: dragState.startCenterScreenPx.x + (screenPoint.x - dragState.startPointerScreenPx.x),
      y: dragState.startCenterScreenPx.y + (screenPoint.y - dragState.startPointerScreenPx.y),
    };
    store.patchPlacement({
      centerMapLatLon: pageAdapter.screenToMap(nextCenterScreenPx),
    });
  }

  function syncPlacementToCurrentRenderTransform(state) {
    if (!state.image || !hasCleanSolvedTransform(state.registration)) {
      return state;
    }

    const snapshot = pageAdapter.getSnapshot();
    const transform = resolveOverlayScreenTransform({
      state,
      snapshot,
      mapToScreen: pageAdapter.mapToScreen,
    });
    store.setPlacement(derivePlacementFromScreenTransform({
      image: state.image,
      transform,
      screenToMap: pageAdapter.screenToMap,
    }));
    return store.getState();
  }

  function updatePointer(pointerScreenPx, partialRuntime = {}) {
    syncRuntime({
      pointerScreenPx,
      ...partialRuntime,
    });
  }

  function syncRuntime(partialRuntime = {}) {
    const previous = runtimeStore.get();
    const state = store.getState();
    const next = {
      ...previous,
      ...partialRuntime,
    };
    next.canCapturePointer =
      Boolean(state.image) &&
      state.mode === INTERACTION_MODE.ALIGN &&
      !next.isPassThroughActive;
    next.canComputeTransform = canSolveRegistration(state.registration);
    runtimeStore.set(next);
  }

  function applyMode(mode) {
    const state = store.getState();
    if (mode === INTERACTION_MODE.TRACE && needsSolveRecompute(state.registration)) {
      computeTransform();
    }
    store.setMode(mode);
    logger.info("Switched mode", { mode });
    syncRuntime();
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
  if (state.mode !== INTERACTION_MODE.ALIGN) {
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
    (state.mode === INTERACTION_MODE.ALIGN || runtime.isPassThroughActive)
  );
}

export function resolvePinContext({ state, runtime, pageAdapter }) {
  if (state.mode !== INTERACTION_MODE.ALIGN) {
    return { ok: false, reason: "not-align-mode" };
  }
  if (!state.image) {
    return { ok: false, reason: "no-image" };
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
