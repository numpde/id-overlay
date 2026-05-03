import { createValueStore } from "./value-store.js";
import { createLogger } from "./logger.js";
import { createRuntimeError, RUNTIME_ERROR_SOURCE } from "./runtime-error.js";
import {
  DEFAULT_INTERACTION_RUNTIME,
  INTERACTION_RUNTIME_ACTION,
  reduceInteractionRuntime,
} from "./interaction-runtime.js";
import {
  canCaptureOverlayPointer,
  canEditRegistration,
  canHandleWheelGesture,
  canTrackOverlayPointer,
  canToggleOverlayPin,
  doesDragEditPlacement,
  doesWheelEditOpacity,
  doesWheelEditPlacement,
  DRAG_MODE,
  INTERACTION_EVENT,
  isMapPanDragMode,
  KEYBOARD_SHORTCUT_ACTION,
  PIN_RESULT_ACTION,
  PIN_RESULT_REASON,
  resolveDragMode,
  resolveKeyboardShortcut,
  resolveOverlayActivationPolicy,
  resolveOverlayPointerMovePolicy,
  resolveOverlayPointerSequencePolicy,
  resolveOverlayWheelPolicy,
  resolveWheelMode,
  shouldIgnoreKeyboardShortcut,
  shouldReleasePassThrough,
  SOLVE_RESULT_REASON,
  WHEEL_MODE,
} from "./interaction-policy.js";
import {
  getOverlayImage,
  hasCleanSolvedTransform,
  hasOverlayImageSession,
  isAlignMode,
  isTraceMode,
  nextSessionMode,
  normalizeSessionMode,
  resolveRegistrationSolveState,
  SESSION_MODE,
} from "./session.js";
import {
  buildPinRenderModels,
  createPlacementTransform,
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
  solveSimilarityTransform,
} from "./transform.js";
import { getOverlayImageLoadStats } from "./image-normalization.js";
import {
  MACHINE_EVENT_KIND,
  MACHINE_PLACEMENT_EDIT_KIND,
} from "./machine/events.js";

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
  let placementEditDraft = null;

  const unsubscribeMachine = machineHost.subscribe(() => {
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
    // Final semantic-history shape: interaction events are currently a parallel
    // outcome bus for status. Prefer canonical UI outcome events for anything
    // user-visible.
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
      dispatchMachine({
        type: MACHINE_EVENT_KIND.LOAD_IMAGE,
        image,
        placement,
      });
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
      dispatchMachine({ type: MACHINE_EVENT_KIND.CLEAR_IMAGE });
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
    applyMode(nextSessionMode(getSession().mode));
  }

  function applyMode(mode) {
    return runInteractionBoundary("apply-mode", () => {
      const normalizedNextMode = normalizeSessionMode(mode);
      resetInteractionState({
        pointerScreenPx: runtimeStore.get().pointerScreenPx,
        isPointerInsideImage: runtimeStore.get().isPointerInsideImage,
      });
      dispatchMachine({
        type: MACHINE_EVENT_KIND.SELECT_MODE,
        mode: normalizedNextMode,
      });
      logger.info("Switched mode", { mode: normalizedNextMode });
      syncRuntimeFromState();
      return true;
    });
  }

  function setOpacity(opacity) {
    dispatchMachine({
      type: MACHINE_EVENT_KIND.SET_OPACITY,
      opacity,
    });
  }

  function computeTransform() {
    // Final semantic-history shape: explicit solve/fit should be represented
    // as a semantic fit-overlay transition, with feedback and history posture
    // owned by that transition.
    return runInteractionBoundary("compute-transform", () => {
      const result = solveRegistrationFromCurrentState();
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

    return preserveRenderedPlacementForRegistrationEdit(() => {
      if (pinContext.existingPin) {
        dispatchMachine({
          type: MACHINE_EVENT_KIND.REMOVE_PIN,
          id: pinContext.existingPin.id,
        });
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

      const previousPins = getSession().registration.pins;
      dispatchMachine({
        type: MACHINE_EVENT_KIND.ADD_PIN,
        imagePx: pinContext.imagePx,
        mapLatLon: pinContext.mapLatLon,
      });
      const pin = findAddedPin(previousPins, getSession().registration.pins);
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
        const hadPins = getSession().registration.pins.length > 0;
        dispatchMachine({ type: MACHINE_EVENT_KIND.CLEAR_PINS });
        const changed = hadPins && getSession().registration.pins.length === 0;
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
      const state = getSession();
      if (button !== 0 || !canCaptureOverlayPointer({
        state,
        runtime: runtimeStore.get(),
      })) {
        return false;
      }

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
        beginPlacementEdit(MACHINE_PLACEMENT_EDIT_KIND.MOVE);
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
        commitPlacementEdit();
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
        dispatchMachine({
          type: MACHINE_EVENT_KIND.SET_OPACITY,
          opacity: nextOpacity,
        });
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
          anchorScreenPx: screenPoint,
          rotationRad: nextRotationRad,
        });
        dispatchMachine({
          type: MACHINE_EVENT_KIND.SET_PLACEMENT,
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
          type: MACHINE_EVENT_KIND.SET_PLACEMENT,
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
    // Final semantic-history shape: double-click is adapter input. It should
    // dispatch a pin-toggle intent after resolving pointer context, not perform
    // the semantic registration mutation directly.
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
      applyMode(SESSION_MODE.TRACE);
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
      state: getSession(),
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
    const state = syncPlacementBaselineToCurrentRenderTransform();
    const snapshot = pageAdapter.getSnapshot();
    const nextPlacement = createRetunedPlacementTransform({
      state,
      snapshot,
      centerScreenPx: nextCenterScreenPx,
    });
    dispatchMachine({
      type: MACHINE_EVENT_KIND.SYNC_PLACEMENT,
      placement: nextPlacement,
    });
  }

  function syncPlacementBaselineToCurrentRenderTransform(state = getSession()) {
    const nextPlacement = derivePlacementFromCurrentRenderTransform(state);
    if (!nextPlacement) {
      return state;
    }
    dispatchMachine({
      type: MACHINE_EVENT_KIND.SYNC_PLACEMENT,
      placement: nextPlacement,
    });
    return getSession();
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
      reduceInteractionRuntime(runtimeStore.get(), action, getSession()),
    );
  }

  function getSession() {
    return machineHost.getState().session;
  }

  function dispatchMachine(event) {
    return machineHost.dispatch(event);
  }

  function beginPlacementEdit(editKind) {
    placementEditDraft = {
      editKind,
      previousPlacement: getSession().placement,
      previousRegistration: getSession().registration,
    };
  }

  function commitPlacementEdit() {
    if (!placementEditDraft) {
      return false;
    }
    const draft = placementEditDraft;
    placementEditDraft = null;
    const nextPlacement = getSession().placement;
    if (areEqualPlacements(draft.previousPlacement, nextPlacement)) {
      return false;
    }
    const result = dispatchMachine({
      type: MACHINE_EVENT_KIND.SET_PLACEMENT,
      placement: nextPlacement,
      previousPlacement: draft.previousPlacement,
      previousRegistration: draft.previousRegistration,
      editKind: draft.editKind,
    });
    return Boolean(result.historyRecord);
  }

  function solveRegistrationFromCurrentState() {
    const state = getSession();
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

    dispatchMachine({
      type: MACHINE_EVENT_KIND.RESTORE_REGISTRATION,
      registration: {
        ...state.registration,
        solvedTransform,
        dirty: false,
      },
    });
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
    return result;
  }

  function resetInteractionState({
    endPointerScreenPx = runtimeStore.get().pointerScreenPx,
    pointerScreenPx = runtimeStore.get().pointerScreenPx,
    isPointerInsideImage = runtimeStore.get().isPointerInsideImage,
  } = {}) {
    if (isMapPanDragMode(dragState?.mode)) {
      pageAdapter.endMapPan?.(endPointerScreenPx);
    } else if (dragState?.mode === DRAG_MODE.MOVE_OVERLAY) {
      commitPlacementEdit();
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

function findAddedPin(previousPins, nextPins) {
  const previousIds = new Set(previousPins.map((pin) => pin.id));
  return nextPins.find((pin) => !previousIds.has(pin.id)) ?? null;
}

function areEqualPlacements(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
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
