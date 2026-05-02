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
  INTERACTION_MODE,
  isAlignMode,
  isMapPanDragMode,
  isTraceMode,
  KEYBOARD_SHORTCUT_ACTION,
  normalizeInteractionMode,
  nextMode,
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
  resolveRegistrationSolveState,
} from "./state.js";
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
import { UI_EFFECT_KIND } from "./ui-effect-model.js";
import { UI_EVENT_KIND } from "./ui-event-model.js";
import { projectLiveUiState } from "./ui-live-state.js";
import { transitionMode } from "./ui-mode-transition.js";

export const INTERACTION_HISTORY_DESCRIPTOR = Object.freeze({
  // TODO(machine-cutover): Delete interaction-authored history descriptors.
  // Semantic machine transitions should own labels and undo/redo events.
  // Final semantic-history shape: these descriptors should move into the
  // state-machine transition records that create history. Interaction code
  // should dispatch semantic edit events, not supply presentation descriptors.
  MOVE_OVERLAY: Object.freeze({
    kind: "move-overlay",
    label: "Moved overlay",
  }),
  ROTATE_OVERLAY: Object.freeze({
    kind: "rotate-overlay",
    label: "Rotated overlay",
  }),
  SCALE_OVERLAY: Object.freeze({
    kind: "scale-overlay",
    label: "Scaled overlay",
  }),
});

export function createInteractionController({
  store,
  pageAdapter,
  keyTarget = globalThis.window,
  keyboardGateway = null,
}) {
  const logger = createLogger("interactions");
  const runtimeStore = createValueStore(DEFAULT_INTERACTION_RUNTIME);
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
    // TODO(machine-cutover): Replace this imperative durable mutation with a
    // machine LOAD_IMAGE/PASTE_SUCCEEDED dispatch.
    // Final semantic-history shape: this should become adapter support for a
    // canonical paste/load-image outcome, not an imperative session mutation
    // that authors mode/placement/history below the UI machine.
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
    // TODO(machine-cutover): Keep interaction cleanup here if needed, but move
    // durable clear-image state/history to the machine transition.
    // Final semantic-history shape: clear-image should enter through the
    // semantic transition pipeline. Interaction cleanup can remain here, but
    // durable session mutation should not.
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

  function undoSessionHistory() {
    // TODO(machine-cutover): Delete this public API with snapshot undo.
    // Final semantic-history shape: this public interaction API should be
    // removed. Undo is a UI event consumed by the transition machine.
    return restoreSessionHistory("undo");
  }

  function redoSessionHistory() {
    // TODO(machine-cutover): Delete this public API with snapshot redo.
    // Final semantic-history shape: this public interaction API should be
    // removed alongside snapshot redo.
    return restoreSessionHistory("redo");
  }

  function toggleMode() {
    // Final semantic-history shape: keyboard mode toggles should dispatch the
    // same canonical MODE_SELECTED event as the panel switch. This direct path
    // through applyMode should not remain a separate transition authority.
    applyMode(nextMode(store.getState().mode));
  }

  function applyResolvedModeTransition({
    nextMode,
    requestSolve = false,
  }) {
    // TODO(machine-cutover): Delete this bridge once mode/fit-overlay are one
    // machine transition with any required history record.
    // Final semantic-history shape: fit-overlay should be a normal semantic
    // transition. This bridge currently performs "solve then set mode" outside
    // the reducer path, which prevents fit from becoming a coherent undoable
    // transition.
    return runInteractionBoundary("apply-mode", () => {
      const normalizedNextMode = normalizeInteractionMode(nextMode);
      if (requestSolve) {
        solveRegistrationFromCurrentState();
      }
      resetInteractionState({
        pointerScreenPx: runtimeStore.get().pointerScreenPx,
        isPointerInsideImage: runtimeStore.get().isPointerInsideImage,
      });
      store.setMode(normalizedNextMode);
      logger.info("Switched mode", { mode: normalizedNextMode });
      syncRuntimeFromState();
      return true;
    });
  }

  function setOpacity(opacity) {
    // Final semantic-history shape: opacity remains non-history, but this is
    // still a direct store mutation from UI controls. Prefer a canonical event
    // if opacity needs to participate in shared transition effects.
    store.setOpacity(opacity);
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
    // Final semantic-history shape: pin toggles should be canonical
    // registration events once pointer context is resolved. Interaction events
    // should not be the user-visible feedback authority.
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
    // Final semantic-history shape: clear-pins is a semantic registration
    // transition. This method should shrink to adapter/runtime cleanup or
    // disappear.
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
    // Final semantic-history shape: pointer handlers should translate raw DOM
    // input into gesture events. Starting a semantic move-overlay edit and its
    // history record should not be embedded in this handler.
    return runInteractionBoundary("handle-pointer-down", () => {
      if (button !== 0 || !canCaptureOverlayPointer({
        state: store.getState(),
        runtime: runtimeStore.get(),
      })) {
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
        // Final semantic-history shape: dragging may still batch many pointer
        // moves into one user edit, but the batch should be owned by the
        // semantic transition record, not by a store descriptor checkpoint.
        store.beginHistoryBatch(INTERACTION_HISTORY_DESCRIPTOR.MOVE_OVERLAY);
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
        // Final semantic-history shape: ending a drag should finalize the
        // pending transition record; it should not directly close store-local
        // snapshot history.
        store.endHistoryBatch();
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
    // Final semantic-history shape: wheel handlers should classify/forward
    // adapter input, then dispatch canonical opacity/rotate/scale/map-zoom
    // events. Semantic overlay edits should not be committed here.
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
          anchorScreenPx: screenPoint,
          rotationRad: nextRotationRad,
        });
        // Final semantic-history shape: wheel rotation should be reported to
        // the transition machine as a semantic edit; interactions should not
        // attach presentation descriptors to store writes.
        store.setPlacement(nextPlacement, {
          historyDescriptor: INTERACTION_HISTORY_DESCRIPTOR.ROTATE_OVERLAY,
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
        // Final semantic-history shape: wheel scaling should commit through a
        // semantic transition record with undo/redo events, not through a
        // store-local descriptor.
        store.setPlacement(nextPlacement, {
          historyDescriptor: INTERACTION_HISTORY_DESCRIPTOR.SCALE_OVERLAY,
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
    // Final semantic-history shape: keyboard handling should resolve to
    // canonical UI events. This function currently jumps from shortcuts to
    // imperative interaction methods.
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
      // Final semantic-history shape: KeyP should dispatch the same semantic
      // pin-toggle event as double-click after pointer context is resolved.
      requestTogglePinAtCurrentPointer();
      return;
    }

    if (shortcutAction === KEYBOARD_SHORTCUT_ACTION.SWITCH_TO_TRACE) {
      logger.info("Keyboard trace escape requested");
      // Final semantic-history shape: this should dispatch MODE_SELECTED so a
      // keyboard Trace switch has the same fit-overlay/history semantics as
      // the panel switch.
      applyMode(INTERACTION_MODE.TRACE);
      return;
    }

    if (shortcutAction === KEYBOARD_SHORTCUT_ACTION.ENABLE_PASS_THROUGH) {
      logger.info("Keyboard pass-through activated");
      // Final semantic-history shape: pass-through is raw input override state;
      // keep it out of history, but project it through canonical UI runtime.
      setPassThrough(true);
    }
  }

  function handleKeyUp(event) {
    // Final semantic-history shape: release remains keyboard/runtime plumbing.
    // User-visible status should observe canonical runtime projection.
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
    // Final semantic-history shape: drag movement should finalize as a
    // transition-machine edit record. Store placement updates should be plain
    // durable session writes.
    store.setPlacement(nextPlacement, {
      historyDescriptor: INTERACTION_HISTORY_DESCRIPTOR.MOVE_OVERLAY,
    });
  }

  function syncPlacementBaselineToCurrentRenderTransform(state = store.getState()) {
    // Final semantic-history shape: this solved-render-to-manual-placement
    // baseline sync is an important domain operation. It should be an explicit
    // semantic transition step, not an invisible prelude inside interactions.
    const nextPlacement = derivePlacementFromCurrentRenderTransform(state);
    if (!nextPlacement) {
      return state;
    }
    store.syncPlacement(nextPlacement);
    return store.getState();
  }

  function preserveRenderedPlacementForRegistrationEdit(mutateRegistration) {
    // Final semantic-history shape: preserving visible placement across pin
    // edits should be stated in registration transition semantics, not hidden
    // as an imperative wrapper around store mutation.
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
    // Final semantic-history shape: this is a local reconstruction of UI state
    // just to run a partial transition. Mode selection should enter through the
    // canonical UI event dispatcher instead.
    const uiState = projectLiveUiState({
      state: store.getState(),
      panelActionState: null,
      runtime: runtimeStore.get(),
    });
    const transitionResult = transitionMode(uiState, {
      kind: UI_EVENT_KIND.MODE_SELECTED,
      mode,
    });
    return applyResolvedModeTransition({
      nextMode: transitionResult.state.session.mode,
      requestSolve: transitionResult.effects.includes(UI_EFFECT_KIND.REQUEST_REGISTRATION_SOLVE),
    });
  }

  function solveRegistrationFromCurrentState() {
    // Final semantic-history shape: if solving is pure from pins, fit-overlay
    // should compute and commit solvedTransform inside the state-machine
    // transition. This imperative helper should remain only for explicit,
    // non-history "compute now" flows, or disappear.
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
    return result;
  }

  function restoreSessionHistory(direction) {
    // TODO(machine-cutover): Delete this direct store.undo()/redo() path.
    // Final semantic-history shape: this should disappear. Undo/redo should be
    // state-machine events that consume semantic history records; interaction
    // code should not call store.undo()/store.redo() directly.
    return runInteractionBoundary(`${direction}-session-history`, () => {
      resetInteractionState({
        endPointerScreenPx: runtimeStore.get().pointerScreenPx,
        pointerScreenPx: null,
        isPointerInsideImage: false,
      });
      const historyDescriptor = direction === "undo" ? store.undo() : store.redo();
      if (historyDescriptor) {
        logger.info(`${direction === "undo" ? "Undid" : "Redid"} session history`);
        syncRuntimeFromState();
      }
      return historyDescriptor;
    }, { fallbackValue: false });
  }

  function resetInteractionState({
    endPointerScreenPx = runtimeStore.get().pointerScreenPx,
    pointerScreenPx = runtimeStore.get().pointerScreenPx,
    isPointerInsideImage = runtimeStore.get().isPointerInsideImage,
  } = {}) {
    if (isMapPanDragMode(dragState?.mode)) {
      pageAdapter.endMapPan?.(endPointerScreenPx);
    } else if (dragState?.mode === DRAG_MODE.MOVE_OVERLAY) {
      store.endHistoryBatch();
    }
    dragState = null;
    dispatchRuntime({
      type: INTERACTION_RUNTIME_ACTION.RESET,
      pointerScreenPx,
      isPointerInsideImage,
    });
  }

  function emitEvent(event) {
    // Final semantic-history shape: do not add new user-facing outcomes here.
    // User-visible results should be transition results or canonical outcome
    // events consumed by the same presentation path.
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
    undoSessionHistory,
    redoSessionHistory,
    toggleMode,
    applyResolvedModeTransition,
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
