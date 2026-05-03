import { createLogger } from "./logger.js";
import { createRuntimeError, RUNTIME_ERROR_SOURCE } from "./runtime-error.js";
import {
  DRAG_MODE,
  isKnownDragMode,
  isKnownWheelMode,
  isMapPanDragMode,
  KEYBOARD_SHORTCUT_ACTION,
  WHEEL_MODE,
} from "./interaction-policy.js";
import { resolveInputProjection } from "./input-projection.js";
import { createKeyboardListeners } from "./keyboard-listeners.js";
import { resolvePlacementEditRenderState } from "./placement-edit-render-state.js";
import {
  getOverlayImage,
  hasOverlayImageSession,
  SESSION_MODE,
} from "./session.js";
import {
  buildPinRenderModels,
  createRetunedPlacementTransform,
  derivePlacementFromCurrentRenderState,
  hitTestPin,
  imagePointToRenderedScreenPoint,
  isImagePointWithinBounds,
  opacityFromWheelDelta,
  resolveOverlayRenderSource,
  resolveOverlayScreenTransform,
  rotationFromWheelDelta,
  scaleFromWheelDelta,
  screenPointToRenderedImagePoint,
} from "./transform.js";
import {
  MACHINE_INPUT_OVERRIDE,
  MACHINE_EVENT_KIND,
  MACHINE_PLACEMENT_EDIT_KIND,
  MACHINE_STATUS_NOTICE_KIND,
} from "./machine/events.js";
import {
  selectIsInputPassThroughActive,
  selectIsRuntimeDragging,
  selectRuntimeGestureKind,
  selectRuntimePointerScreenPx,
} from "./machine/selectors.js";

export function createInteractionController({
  machineHost,
  pageAdapter,
  keyTarget = globalThis.window,
  keyboardGateway = null,
}) {
  const logger = createLogger("interactions");
  let isAdapterMapPanActive = false;
  let adapterOverlayMove = null;
  let observedRuntime = machineHost.getState().runtime;

  const unsubscribeMachine = machineHost.subscribe((state) => {
    const previousRuntime = observedRuntime;
    observedRuntime = state.runtime;
    syncAdapterDragFromRuntimeChange(previousRuntime, state.runtime);
  }, { emitCurrent: false });
  const keyboardListeners = createKeyboardListeners({
    keyTarget,
    keyboardGateway,
    keydown: handleKeyDown,
    keyup: handleKeyUp,
    blur: handleWindowBlur,
  });

  function destroy() {
    unsubscribeMachine();
    keyboardListeners.destroy();
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
      return togglePinAtScreenPoint(screenPoint);
    }, { fallbackValue: false });
  }

  function togglePinAtScreenPoint(screenPoint) {
    const snapshot = pageAdapter.getSnapshot();
    const pinContext = resolvePinContext({
      state: getSession(),
      snapshot,
      screenPoint,
      pageAdapter,
    });
    if (!pinContext.ok) {
      logger.warn("Pin toggle requested without a valid pin context", {
        reason: pinContext.reason,
      });
      return false;
    }

    const preservedPlacement = derivePlacementFromCurrentRenderState({
      state: getMachineState(),
      snapshot,
    });
    const event = {
      type: MACHINE_EVENT_KIND.TOGGLE_PIN,
      imagePx: pinContext.imagePx,
      mapLatLon: pinContext.mapLatLon,
      existingPinId: pinContext.existingPin?.id ?? null,
      ...(preservedPlacement ? { preservedPlacement } : {}),
    };
    const result = dispatchMachine(event);
    const handled = Boolean(result.historyRecord);
    if (handled) {
      logger.info("Toggled registration pin", {
        pinId: pinContext.existingPin?.id ?? null,
      });
      updatePointer(pinContext.pointerScreenPx);
    }
    return handled;
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
      const dragMode = getActiveAdapterDragMode();
      if (selectIsRuntimeDragging(runtime) && dragMode) {
        dragTo(screenPoint);
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
      if (button !== 0 || !isKnownDragMode(dragMode)) {
        return false;
      }

      if (isMapPanDragMode(dragMode)) {
        const beganMapPan = pageAdapter.beginMapPan?.(screenPoint) === true;
        if (!beganMapPan) {
          logger.warn("Map pan requested, but the page adapter could not start it");
          return false;
        }
        isAdapterMapPanActive = true;
        adapterOverlayMove = null;
      } else if (dragMode === DRAG_MODE.MOVE_OVERLAY) {
        const snapshot = pageAdapter.getSnapshot();
        const interactionState = resolvePlacementEditRenderState({
          state: getMachineState(),
          snapshot,
        });
        if (!interactionState) {
          return false;
        }
        const image = getOverlayImage(interactionState);
        const screenTransform = resolveOverlayScreenTransform({
          state: interactionState,
          snapshot,
        });
        const centerScreenPx = imagePointToRenderedScreenPoint({
          imagePoint: {
            x: image.width / 2,
            y: image.height / 2,
          },
          transform: screenTransform,
          snapshot,
        });
        isAdapterMapPanActive = false;
        adapterOverlayMove = {
          startPointerScreenPx: screenPoint,
          startCenterScreenPx: centerScreenPx,
        };
        dispatchMachine({
          type: MACHINE_EVENT_KIND.BEGIN_PLACEMENT_EDIT,
          editKind: MACHINE_PLACEMENT_EDIT_KIND.MOVE,
          renderedPlacement: interactionState.placement,
        });
      } else {
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
      if (!hasActiveAdapterDrag()) {
        return false;
      }
      dragTo(screenPoint);
      if (isAdapterMapPanActive) {
        pageAdapter.endMapPan?.(screenPoint);
      } else {
        dispatchMachine({
          type: MACHINE_EVENT_KIND.COMMIT_PLACEMENT_EDIT,
        });
      }
      clearAdapterDrag();
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
      if (!isKnownWheelMode(wheelMode)) {
        return false;
      }
      if (wheelMode === WHEEL_MODE.MAP_ZOOM) {
        return handleMapZoomWheel({ deltaY, screenPoint });
      }
      if (wheelMode === WHEEL_MODE.ADJUST_OPACITY) {
        return handleOpacityWheel({ deltaY, screenPoint });
      }
      return handlePlacementWheel({ deltaY, wheelMode, screenPoint });
    }, { fallbackValue: false });
  }

  function handleMapZoomWheel({ deltaY, screenPoint }) {
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
        deltaY,
        renderSource: resolveOverlayRenderSource(getSession()),
      },
    );
    updatePointer(screenPoint);
    return true;
  }

  function handleOpacityWheel({ deltaY, screenPoint }) {
    const nextOpacity = opacityFromWheelDelta(getSession().opacity, deltaY);
    dispatchMachine({
      type: MACHINE_EVENT_KIND.SET_OPACITY,
      opacity: nextOpacity,
    });
    logger.info("Adjusted overlay opacity", { opacity: nextOpacity, deltaY });
    updatePointer(screenPoint);
    return true;
  }

  function handlePlacementWheel({ deltaY, wheelMode, screenPoint }) {
    const snapshot = pageAdapter.getSnapshot();
    const placementState = resolvePlacementEditRenderState({
      state: getMachineState(),
      snapshot,
    });
    if (!placementState) {
      return false;
    }
    if (wheelMode === WHEEL_MODE.ROTATE_OVERLAY) {
      const nextRotationRad = rotationFromWheelDelta(placementState.placement.rotationRad, deltaY);
      const nextPlacement = createRetunedPlacementTransform({
        state: placementState,
        snapshot,
        anchorScreenPx: screenPoint,
        rotationRad: nextRotationRad,
      });
      dispatchMachine({
        type: MACHINE_EVENT_KIND.APPLY_PLACEMENT_EDIT,
        renderedPlacement: placementState.placement,
        placement: nextPlacement,
        editKind: MACHINE_PLACEMENT_EDIT_KIND.ROTATE,
      });
      logger.info("Rotated overlay placement", { rotationRad: nextRotationRad, deltaY });
    } else if (wheelMode === WHEEL_MODE.ZOOM_OVERLAY) {
      const screenScale = Math.hypot(placementState.placement.a, placementState.placement.b) * (2 ** snapshot.mapView.zoom);
      const nextScale = scaleFromWheelDelta(screenScale, deltaY);
      const nextPlacement = createRetunedPlacementTransform({
        state: placementState,
        snapshot,
        anchorScreenPx: screenPoint,
        screenScale: nextScale,
      });
      dispatchMachine({
        type: MACHINE_EVENT_KIND.APPLY_PLACEMENT_EDIT,
        renderedPlacement: placementState.placement,
        placement: nextPlacement,
        editKind: MACHINE_PLACEMENT_EDIT_KIND.SCALE,
      });
      logger.info("Scaled overlay placement", { scale: nextScale, deltaY });
    } else {
      return false;
    }
    updatePointer(screenPoint);
    return true;
  }

  function handleKeyDown(event) {
    const state = getSession();
    if (!hasOverlayImageSession(state)) {
      return;
    }

    const keyboardProjection = resolveInputProjection({
      machineState: getMachineState(),
      runtime: getRuntimeState(),
      event,
    }).keyboard;
    const shortcutAction = keyboardProjection.action;
    if (!shortcutAction) {
      if (!keyboardProjection.shouldIgnore) {
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
    dispatchKeyboardShortcut(shortcutAction);
  }

  function dispatchKeyboardShortcut(shortcutAction) {
    if (shortcutAction === KEYBOARD_SHORTCUT_ACTION.TOGGLE_PIN_CURRENT_POINTER) {
      logger.info("Keyboard pin toggle requested", {
        pointerScreenPx: getPointerScreenPx(),
      });
      togglePinAtScreenPoint(getPointerScreenPx());
      return;
    }

    if (shortcutAction === KEYBOARD_SHORTCUT_ACTION.SWITCH_TO_TRACE) {
      logger.info("Keyboard trace escape requested");
      applyMode(SESSION_MODE.TRACE);
      return;
    }

    if (shortcutAction === KEYBOARD_SHORTCUT_ACTION.ENABLE_PASS_THROUGH) {
      logger.info("Keyboard pass-through activated");
      setPassThrough(true);
    }
  }

  function handleKeyUp(event) {
    const inputProjection = resolveInputProjection({
      machineState: getMachineState(),
      event,
      runtime: getRuntimeState(),
    });
    if (!inputProjection.passThroughRelease.shouldRelease) {
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
      endPointerScreenPx: getPointerScreenPx(),
      pointerScreenPx: null,
    });
  }

  function dragTo(screenPoint) {
    if (!hasActiveAdapterDrag()) {
      return;
    }

    if (isAdapterMapPanActive) {
      pageAdapter.updateMapPan(screenPoint);
      return;
    }

    const nextCenterScreenPx = {
      x: adapterOverlayMove.startCenterScreenPx.x + (screenPoint.x - adapterOverlayMove.startPointerScreenPx.x),
      y: adapterOverlayMove.startCenterScreenPx.y + (screenPoint.y - adapterOverlayMove.startPointerScreenPx.y),
    };
    const snapshot = pageAdapter.getSnapshot();
    const state = resolvePlacementEditRenderState({
      state: getMachineState(),
      snapshot,
    });
    if (!state) {
      return;
    }
    const nextPlacement = createRetunedPlacementTransform({
      state,
      snapshot,
      centerScreenPx: nextCenterScreenPx,
    });
    dispatchMachine({
      type: MACHINE_EVENT_KIND.PREVIEW_PLACEMENT_EDIT,
      placement: nextPlacement,
    });
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

  function getSession() {
    return getMachineState().session;
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
    finishAdapterDrag(endPointerScreenPx, { commitPlacement: true });
    clearAdapterDrag();
    dispatchMachine({
      type: MACHINE_EVENT_KIND.RESET_INPUT_RUNTIME,
      screenPx: pointerScreenPx,
    });
  }

  function syncAdapterDragFromRuntimeChange(previousRuntime, nextRuntime) {
    if (
      !hasActiveAdapterDrag() ||
      !selectIsRuntimeDragging(previousRuntime) ||
      selectIsRuntimeDragging(nextRuntime)
    ) {
      return;
    }
    finishAdapterDrag(selectRuntimePointerScreenPx(previousRuntime), {
      commitPlacement: false,
    });
    clearAdapterDrag();
  }

  function finishAdapterDrag(endPointerScreenPx, { commitPlacement }) {
    if (isAdapterMapPanActive) {
      pageAdapter.endMapPan?.(endPointerScreenPx);
      return;
    }
    if (commitPlacement && adapterOverlayMove) {
      dispatchMachine({
        type: MACHINE_EVENT_KIND.COMMIT_PLACEMENT_EDIT,
      });
    }
  }

  function hasActiveAdapterDrag() {
    return isAdapterMapPanActive || Boolean(adapterOverlayMove);
  }

  function getActiveAdapterDragMode() {
    if (isAdapterMapPanActive) {
      return DRAG_MODE.MAP_PAN;
    }
    if (adapterOverlayMove) {
      return DRAG_MODE.MOVE_OVERLAY;
    }
    return null;
  }

  function clearAdapterDrag() {
    isAdapterMapPanActive = false;
    adapterOverlayMove = null;
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

function consumeEvent(event) {
  event.preventDefault?.();
  event.stopPropagation?.();
  event.stopImmediatePropagation?.();
}

function resolvePinContext({ state, snapshot, screenPoint, pageAdapter }) {
  if (!hasOverlayImageSession(state)) {
    return createPinContextFailure("no-image");
  }
  const pointerScreenPx = screenPoint;
  if (!pointerScreenPx) {
    return createPinContextFailure("no-pointer");
  }

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
    return createPinContextFailure("pointer-outside-image", {
      pointerScreenPx,
      imagePx,
    });
  }

  const renderedPins = buildPinRenderModels({
    pins: state.registration.pins,
    transform: currentTransform,
    projectOverlayScreenPoint: (pinImagePx) => imagePointToRenderedScreenPoint({
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

function createPinContextFailure(reason, extra = {}) {
  return {
    ok: false,
    reason,
    ...extra,
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
