import { createLogger } from "./logger.js";
import { createRuntimeError, RUNTIME_ERROR_SOURCE } from "./runtime-error.js";
import {
  DRAG_MODE,
  INTERACTION_EVENT,
  isMapPanDragMode,
  KEYBOARD_SHORTCUT_ACTION,
  WHEEL_MODE,
} from "./interaction-policy.js";
import { resolveInputProjection } from "./input-projection.js";
import {
  createPlacementEditedRegistration,
  getOverlayImage,
  hasCleanSolvedTransform,
  hasOverlayImageSession,
  SESSION_MODE,
} from "./session.js";
import {
  buildPinRenderModels,
  createSimilarityTransformFromAnchor,
  derivePlacementFromScreenTransform,
  hitTestPin,
  imagePointToRenderedScreenPoint,
  isImagePointWithinBounds,
  opacityFromWheelDelta,
  removeSurfaceMotionFromScreenPoint,
  resolveOverlayRenderSource,
  resolveOverlayScreenTransform,
  rotationFromWheelDelta,
  scaleFromWheelDelta,
  screenPointToImagePoint,
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
  const eventListeners = new Set();
  let dragState = null;
  let observedRuntime = machineHost.getState().runtime;

  const unsubscribeMachine = machineHost.subscribe((state) => {
    const previousRuntime = observedRuntime;
    observedRuntime = state.runtime;
    syncAdapterDragFromRuntimeChange(previousRuntime, state.runtime);
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

  function destroy() {
    unsubscribeMachine();
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

  function subscribeEvents(listener) {
    // Low-level telemetry only. User-visible outcomes flow through the machine
    // result stream.
    eventListeners.add(listener);
    return () => eventListeners.delete(listener);
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

  function togglePinAtCurrentPointer() {
    const pinContext = resolvePinContext({
      state: getSession(),
      runtime: getRuntimeState(),
      pageAdapter,
    });
    if (!pinContext.ok) {
      logger.warn("Pin toggle requested without a valid pin context", {
        reason: pinContext.reason,
      });
      return false;
    }

    const preservedPlacement = derivePlacementFromCurrentRenderTransform(getSession());
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
      if (selectIsRuntimeDragging(runtime) && dragState) {
        dragTo(screenPoint);
        startDragRuntime(screenPoint, {
          dragMode: dragState.mode,
        });
        return true;
      }
      updatePointer(screenPoint);
      return true;
    }, { fallbackValue: false });
  }

  function handlePointerDown({ button, screenPoint, shiftKey, dragMode: explicitDragMode = null }) {
    return runInteractionBoundary("handle-pointer-down", () => {
      const inputProjection = resolveInputProjection({
        machineState: getMachineState(),
        runtime: getRuntimeState(),
        isPointerOverOverlay: true,
        button,
        shiftKey,
      });
      if (!inputProjection.pointerSequence.shouldOwnPointerSequence) {
        return false;
      }

      const state = getSession();
      const dragMode = explicitDragMode ?? inputProjection.pointerSequence.dragMode;
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
        const interactionState = resolvePlacementEditRenderState(state);
        if (!interactionState) {
          return false;
        }
        const image = getOverlayImage(interactionState);
        const snapshot = pageAdapter.getSnapshot();
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
        dragState = {
          mode: DRAG_MODE.MOVE_OVERLAY,
          startPointerScreenPx: screenPoint,
          startCenterScreenPx: centerScreenPx,
        };
        dispatchMachine({
          type: MACHINE_EVENT_KIND.BEGIN_PLACEMENT_EDIT,
          editKind: MACHINE_PLACEMENT_EDIT_KIND.MOVE,
          renderedPlacement: interactionState.placement,
        });
      }
      startDragRuntime(screenPoint, {
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
      } else {
        dispatchMachine({
          type: MACHINE_EVENT_KIND.COMMIT_PLACEMENT_EDIT,
        });
      }
      dragState = null;
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

  function handleWheel({ deltaY, shiftKey, altKey, ctrlKey, screenPoint }) {
    return runInteractionBoundary("handle-wheel", () => {
      const state = getSession();
      const runtime = getRuntimeState();
      const inputProjection = resolveInputProjection({
        machineState: getMachineState(),
        runtime,
        isPointerOverOverlay: true,
        shiftKey,
        altKey,
        ctrlKey,
      });
      const wheelMode = inputProjection.wheel.wheelMode;
      if (!inputProjection.wheel.shouldHandle) {
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
        updatePointer(screenPoint);
        return true;
      }

      if (wheelMode === WHEEL_MODE.ADJUST_OPACITY) {
        const nextOpacity = opacityFromWheelDelta(state.opacity, deltaY);
        dispatchMachine({
          type: MACHINE_EVENT_KIND.SET_OPACITY,
          opacity: nextOpacity,
        });
        logger.info("Adjusted overlay opacity", { opacity: nextOpacity, deltaY });
        updatePointer(screenPoint);
        return true;
      }

      const placementState = resolvePlacementEditRenderState(state);
      if (!placementState) {
        return false;
      }
      const snapshot = pageAdapter.getSnapshot();
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
      }
      updatePointer(screenPoint);
      return true;
    }, { fallbackValue: false });
  }

  function handleDoubleClick(screenPoint) {
    return runInteractionBoundary("handle-double-click", () => {
      updatePointer(screenPoint);
      return togglePinAtCurrentPointer();
    }, { fallbackValue: false });
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

    if (shortcutAction === KEYBOARD_SHORTCUT_ACTION.TOGGLE_PIN_CURRENT_POINTER) {
      logger.info("Keyboard pin toggle requested", {
        pointerScreenPx: getPointerScreenPx(),
      });
      togglePinAtCurrentPointer();
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
    const state = resolvePlacementEditRenderState();
    if (!state) {
      return;
    }
    const snapshot = pageAdapter.getSnapshot();
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

  function resolvePlacementEditRenderState(state = getSession()) {
    const placement = getMachineState().runtime.placementEdit?.previewPlacement ??
      derivePlacementFromCurrentRenderTransform(state) ??
      state.placement;
    if (placement?.type !== "similarity") {
      return null;
    }
    return {
      ...state,
      placement,
      registration: createPlacementEditedRegistration(state.registration),
    };
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
    dragState = null;
    dispatchMachine({
      type: MACHINE_EVENT_KIND.RESET_INPUT_RUNTIME,
      screenPx: pointerScreenPx,
    });
  }

  function syncAdapterDragFromRuntimeChange(previousRuntime, nextRuntime) {
    if (
      !dragState ||
      !selectIsRuntimeDragging(previousRuntime) ||
      selectIsRuntimeDragging(nextRuntime)
    ) {
      return;
    }
    finishAdapterDrag(selectRuntimePointerScreenPx(previousRuntime), {
      commitPlacement: false,
    });
    dragState = null;
  }

  function finishAdapterDrag(endPointerScreenPx, { commitPlacement }) {
    if (isMapPanDragMode(dragState?.mode)) {
      pageAdapter.endMapPan?.(endPointerScreenPx);
      return;
    }
    if (commitPlacement && dragState?.mode === DRAG_MODE.MOVE_OVERLAY) {
      dispatchMachine({
        type: MACHINE_EVENT_KIND.COMMIT_PLACEMENT_EDIT,
      });
    }
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
    emitEvent({
      type: INTERACTION_EVENT.RUNTIME_ERROR,
      error: runtimeError,
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
    subscribeEvents,
    getRuntimeState,
    handlePointerEnter,
    handlePointerLeave,
    handlePointerMove,
    handlePointerDown,
    handlePointerUp,
    handlePointerCancel,
    handleWheel,
    handleDoubleClick,
    reportRuntimeError,
  };
}

function createRetunedPlacementTransform({
  state,
  snapshot,
  centerScreenPx = null,
  anchorScreenPx = null,
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
  const resolvedScreenScale = screenScale ?? Math.hypot(screenTransform.a, screenTransform.b);
  const resolvedRotationRad = rotationRad ?? Math.atan2(screenTransform.b, screenTransform.a);
  const anchorImagePx = anchorScreenPx
    ? screenPointToRenderedImagePoint({
      screenPoint: anchorScreenPx,
      transform: screenTransform,
      snapshot,
    })
    : null;

  if (
    anchorImagePx &&
    isImagePointWithinBounds(anchorImagePx, image)
  ) {
    return derivePlacementFromScreenTransform({
      snapshot,
      transform: createSimilarityTransformFromAnchor({
        anchorImagePx,
        anchorTargetPx: removeSurfaceMotionFromScreenPoint({
          screenPoint: anchorScreenPx,
          snapshot,
        }),
        scale: resolvedScreenScale,
        rotationRad: resolvedRotationRad,
      }),
    });
  }

  const resolvedCenterScreenPx = centerScreenPx ?? imagePointToRenderedScreenPoint({
    imagePoint: imageCenter,
    transform: screenTransform,
    snapshot,
  });
  return derivePlacementFromScreenTransform({
    snapshot,
    transform: createSimilarityTransformFromAnchor({
      anchorImagePx: imageCenter,
      anchorTargetPx: removeSurfaceMotionFromScreenPoint({
        screenPoint: resolvedCenterScreenPx,
        snapshot,
      }),
      scale: resolvedScreenScale,
      rotationRad: resolvedRotationRad,
    }),
  });
}

function consumeEvent(event) {
  event.preventDefault?.();
  event.stopPropagation?.();
  event.stopImmediatePropagation?.();
}

function resolvePinContext({ state, runtime, pageAdapter }) {
  if (!resolveInputProjection({ state, runtime }).overlayPolicy.canEditOverlay) {
    return createPinContextFailure(hasOverlayImageSession(state) ? "not-align-mode" : "no-image");
  }
  const pointerScreenPx = selectRuntimePointerScreenPx(runtime);
  if (!pointerScreenPx) {
    return createPinContextFailure("no-pointer");
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
