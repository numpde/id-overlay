import { createValueStore } from "./value-store.js";
import { createLogger } from "./logger.js";
import { createRuntimeError, RUNTIME_ERROR_SOURCE } from "./runtime-error.js";
import {
  DEFAULT_INTERACTION_RUNTIME,
  INTERACTION_RUNTIME_ACTION,
  reduceInteractionRuntime,
} from "./interaction-runtime.js";
import {
  DRAG_MODE,
  INTERACTION_EVENT,
  isMapPanDragMode,
  KEYBOARD_SHORTCUT_ACTION,
  PIN_RESULT_ACTION,
  PIN_RESULT_REASON,
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
  MACHINE_EVENT_KIND,
  MACHINE_FEEDBACK_KIND,
  MACHINE_PLACEMENT_EDIT_KIND,
} from "./machine/events.js";
import { describeRuntimeErrorPresentation } from "./presentation.js";

export function createInteractionController({
  machineHost,
  pageAdapter,
  keyTarget = globalThis.window,
  keyboardGateway = null,
}) {
  const logger = createLogger("interactions");
  const runtimeStore = createValueStore(DEFAULT_INTERACTION_RUNTIME);
  const eventListeners = new Set();
  let dragState = null;
  let observedSession = machineHost.getState().session;

  const unsubscribeMachine = machineHost.subscribe((state) => {
    const previousSession = observedSession;
    observedSession = state.session;
    syncRuntimeFromSessionChange(previousSession, state.session);
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
    return runtimeStore.subscribe(listener, options);
  }

  function subscribeEvents(listener) {
    // Low-level telemetry only. User-visible outcomes flow through the machine
    // result stream.
    eventListeners.add(listener);
    return () => eventListeners.delete(listener);
  }

  function getRuntimeState() {
    return runtimeStore.get();
  }

  function applyMode(mode) {
    return runInteractionBoundary("apply-mode", () => {
      resetInteractionState({
        pointerScreenPx: runtimeStore.get().pointerScreenPx,
        isPointerInsideImage: runtimeStore.get().isPointerInsideImage,
      });
      dispatchMachine({
        type: MACHINE_EVENT_KIND.SELECT_MODE,
        mode,
      });
      logger.info("Requested mode switch", { mode });
      syncRuntimeFromState();
      return true;
    });
  }

  function requestTogglePinAtCurrentPointer() {
    return togglePinAtCurrentPointer();
  }

  function togglePinAtCurrentPointer() {
    const pinContext = resolvePinContext({
      state: getSession(),
      runtime: runtimeStore.get(),
      pageAdapter,
    });
    if (!pinContext.ok) {
      logger.warn("Pin toggle requested without a valid pin context", {
        reason: pinContext.reason,
      });
      return pinContext;
    }

    const previousPins = getSession().registration.pins;
    const preservedPlacement = derivePlacementFromCurrentRenderTransform(getSession());
    const event = {
      type: MACHINE_EVENT_KIND.TOGGLE_PIN,
      imagePx: pinContext.imagePx,
      mapLatLon: pinContext.mapLatLon,
      existingPinId: pinContext.existingPin?.id ?? null,
      ...(preservedPlacement ? { preservedPlacement } : {}),
    };
    const result = dispatchMachine(event);

    const pinResult = createPinResultFromTransition({
      result,
      pinContext,
      previousPins,
    });
    if (pinResult.ok) {
      logger.info("Toggled registration pin", {
        action: pinResult.action,
        pinId: pinResult.pin?.id ?? null,
      });
      dispatchRuntime({
        type: INTERACTION_RUNTIME_ACTION.UPDATE_POINTER,
        pointerScreenPx: pinContext.pointerScreenPx,
        isPointerInsideImage: true,
      });
    }
    return pinResult;
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
      const inputProjection = resolveInputProjection({
        machineState: getMachineState(),
        runtime: runtimeStore.get(),
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
      } else {
        dispatchMachine({
          type: MACHINE_EVENT_KIND.COMMIT_PLACEMENT_EDIT,
        });
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
      const state = getSession();
      const runtime = runtimeStore.get();
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
        updatePointer(screenPoint, { isPointerInsideImage: true });
        return true;
      }

      if (wheelMode === WHEEL_MODE.ADJUST_OPACITY) {
        const nextOpacity = opacityFromWheelDelta(state.opacity, deltaY);
        dispatchMachine({
          type: MACHINE_EVENT_KIND.SET_OPACITY,
          opacity: nextOpacity,
        });
        logger.info("Adjusted overlay opacity", { opacity: nextOpacity, deltaY });
        updatePointer(screenPoint, { isPointerInsideImage: true });
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
    const state = getSession();
    if (!hasOverlayImageSession(state)) {
      return;
    }

    const keyboardProjection = resolveInputProjection({
      machineState: getMachineState(),
      runtime: runtimeStore.get(),
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
        pointerScreenPx: runtimeStore.get().pointerScreenPx,
      });
      requestTogglePinAtCurrentPointer();
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
      runtime: runtimeStore.get(),
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

  function syncRuntimeFromSessionChange(previousSession, nextSession) {
    const imageWasRemoved = Boolean(previousSession.image) && !nextSession.image;
    const modeChanged = previousSession.mode !== nextSession.mode;
    if (!imageWasRemoved && !modeChanged) {
      syncRuntimeFromState();
      return;
    }

    resetInteractionState({
      endPointerScreenPx: runtimeStore.get().pointerScreenPx,
      pointerScreenPx: imageWasRemoved ? null : runtimeStore.get().pointerScreenPx,
      isPointerInsideImage: imageWasRemoved
        ? false
        : runtimeStore.get().isPointerInsideImage,
    });
  }

  function dispatchRuntime(action) {
    runtimeStore.set(
      reduceInteractionRuntime(runtimeStore.get(), action, getSession()),
    );
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

  function resetInteractionState({
    endPointerScreenPx = runtimeStore.get().pointerScreenPx,
    pointerScreenPx = runtimeStore.get().pointerScreenPx,
    isPointerInsideImage = runtimeStore.get().isPointerInsideImage,
  } = {}) {
    if (isMapPanDragMode(dragState?.mode)) {
      pageAdapter.endMapPan?.(endPointerScreenPx);
    } else if (dragState?.mode === DRAG_MODE.MOVE_OVERLAY) {
      dispatchMachine({
        type: MACHINE_EVENT_KIND.COMMIT_PLACEMENT_EDIT,
      });
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
    dispatchMachine({
      type: MACHINE_EVENT_KIND.REPORT_FEEDBACK,
      feedbackKind: MACHINE_FEEDBACK_KIND.RUNTIME_ERROR,
      message: describeRuntimeErrorPresentation(runtimeError),
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
    requestTogglePinAtCurrentPointer,
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

export function resolvePinContext({ state, runtime, pageAdapter }) {
  if (!resolveInputProjection({ state, runtime }).overlayPolicy.canEditOverlay) {
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

function findAddedPin(previousPins, nextPins) {
  const previousIds = new Set(previousPins.map((pin) => pin.id));
  return nextPins.find((pin) => !previousIds.has(pin.id)) ?? null;
}

function createPinResultFromTransition({ result, pinContext, previousPins }) {
  if (result.feedback.kind === MACHINE_FEEDBACK_KIND.PIN_REMOVED) {
    return createPinSuccessResult(PIN_RESULT_ACTION.REMOVED, pinContext.existingPin);
  }
  if (result.feedback.kind === MACHINE_FEEDBACK_KIND.PIN_ADDED) {
    return createPinSuccessResult(
      PIN_RESULT_ACTION.ADDED,
      findAddedPin(previousPins, result.state.session.registration.pins),
    );
  }
  return createPinFailureResult(PIN_RESULT_REASON.NO_POINTER);
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
