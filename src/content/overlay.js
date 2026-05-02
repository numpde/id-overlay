import {
  FORWARDED_MAP_GESTURE_EVENT_FLAG,
} from "./page-adapter.js";
import {
  buildOverlayRenderModel,
  buildPinRenderModels,
  imagePointToRenderedScreenPoint,
  imagePointToScreenPoint,
  isImagePointWithinBounds,
  resolveOverlayScreenTransform,
  screenPointToRenderedImagePoint,
} from "../core/transform.js";
import { getOverlayImage, hasOverlayImageSession } from "../core/state.js";
import {
  getRuntimePointerScreenPx,
  isRuntimeDragging,
  isRuntimePassThroughActive,
  isRuntimePointerInsideImage,
} from "../core/interaction-runtime.js";
import {
  resolveRegistrationUiPolicy,
  resolveOverlayActivationPolicy,
  resolveOverlayPointerMovePolicy,
  resolveOverlayPointerSequencePolicy,
  resolveOverlayWheelPolicy,
} from "../core/interaction-policy.js";
import {
  beginOverlayPointerSequence,
  clearOverlayPointerSequence,
  createInitialOverlayPointerSequenceState,
  hasPendingOverlayPointerSequence,
  resolveOverlayPointerSequenceActivation,
} from "../core/overlay-pointer-sequence.js";
import { RUNTIME_ERROR_SOURCE } from "../core/runtime-error.js";

const OVERLAY_STYLE_ID = "id-overlay-map-styles";
const OVERLAY_STYLE_TEXT = `
.id-overlay-viewport {
  position: absolute;
  overflow: hidden;
  pointer-events: none;
  z-index: 1;
}

.id-overlay-map-layer {
  position: absolute;
  inset: 0;
  overflow: hidden;
  transform-origin: 0 0;
  pointer-events: none;
}

.id-overlay-image {
  position: absolute;
  display: none;
  max-width: none;
  max-height: none;
  user-select: none;
  pointer-events: none;
}

.id-overlay-frame {
  position: absolute;
  display: none;
  border: 1px solid rgba(15, 23, 42, 0.42);
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.36) inset;
  user-select: none;
  pointer-events: none;
}

.id-overlay-pin-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.id-overlay-map-pin-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.id-overlay-pin {
  position: absolute;
  min-width: 22px;
  min-height: 22px;
  padding: 0 6px;
  border: 2px solid #ffffff;
  border-radius: 999px;
  background: rgba(37, 99, 235, 0.95);
  color: #ffffff;
  font: 11px/18px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  font-weight: 700;
  text-align: center;
  transform: translate(-50%, -50%);
  box-shadow: 0 0 0 2px rgba(15, 23, 42, 0.2);
}

.id-overlay-map-pin {
  position: absolute;
  min-width: 18px;
  min-height: 18px;
  padding: 0 4px;
  border: 1px solid rgba(255, 255, 255, 0.82);
  border-radius: 999px;
  background: rgba(37, 99, 235, 0.52);
  color: rgba(255, 255, 255, 0.94);
  font: 10px/16px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  font-weight: 700;
  text-align: center;
  transform: translate(-50%, -50%);
  box-shadow:
    0 0 0 1px rgba(15, 23, 42, 0.12),
    0 1px 6px rgba(15, 23, 42, 0.1);
  opacity: 0.88;
}

`;

export function createOverlay({ pageAdapter, store, interactions }) {
  const overlayRoot = document.createElement("div");
  overlayRoot.className = "id-overlay-viewport";
  overlayRoot.dataset.idOverlayOwned = "true";

  const mapLayer = document.createElement("div");
  mapLayer.className = "id-overlay-map-layer";

  const overlayImage = document.createElement("img");
  overlayImage.className = "id-overlay-image";
  overlayImage.alt = "";
  overlayImage.decoding = "async";

  const overlayFrame = document.createElement("div");
  overlayFrame.className = "id-overlay-frame";

  const mapPinLayer = document.createElement("div");
  mapPinLayer.className = "id-overlay-map-pin-layer";

  const pinLayer = document.createElement("div");
  pinLayer.className = "id-overlay-pin-layer";

  mapLayer.append(overlayImage, overlayFrame, mapPinLayer, pinLayer);
  overlayRoot.append(mapLayer);

  let latestSnapshot = pageAdapter.getSnapshot();
  let latestRuntime = interactions.getRuntimeState();
  let renderFrame = null;
  let mountElement = null;
  let wheelTarget = null;
  let dragEventWindow = null;
  let pendingPointerSequence = createInitialOverlayPointerSequenceState();

  const unsubscribeStore = store.subscribe(scheduleRender);
  const unsubscribeViewport = pageAdapter.subscribe((nextSnapshot) => {
    latestSnapshot = nextSnapshot;
    scheduleRender();
  });
  const unsubscribeInteractions = interactions.subscribe((runtime) => {
    // Final semantic-history shape: overlay may subscribe to raw input runtime
    // for event plumbing, but visible affordances should come from canonical
    // UI runtime projection rather than this raw store.
    latestRuntime = runtime;
    syncGlobalPointerListeners();
    scheduleRender();
  });
  scheduleRender();

  function scheduleRender() {
    if (renderFrame !== null && typeof globalThis.cancelAnimationFrame === "function") {
      return;
    }
    if (typeof globalThis.requestAnimationFrame !== "function") {
      render();
      return;
    }
    renderFrame = globalThis.requestAnimationFrame(() => {
      renderFrame = null;
      render();
    });
  }

  function render() {
    ensureOverlayMount();

    const state = store.getState();
    const viewportRect = latestSnapshot.viewportRect;
    const localViewportRect = latestSnapshot.localViewportRect ?? viewportRect;
    // Final semantic-history shape: overlay rendering should consume canonical
    // UI affordance/selectors rather than recomputing panel/registration
    // policy from raw store state in parallel with ui-view-model.
    const registrationUi = resolveRegistrationUiPolicy(state);
    const overlayOwnsPointerHitTesting = doesOverlayOwnPointerHitTesting({
      state,
      runtime: latestRuntime,
      registrationUi,
    });
    // Final semantic-history shape: this dataset is presentation of canonical
    // mode. Keep it as a DOM projection only; do not let tests treat it as a
    // separate source of mode truth.
    overlayRoot.dataset.mode = state.mode;
    overlayRoot.dataset.passThrough = String(isRuntimePassThroughActive(latestRuntime));
    overlayRoot.style.left = `${localViewportRect.left}px`;
    overlayRoot.style.top = `${localViewportRect.top}px`;
    overlayRoot.style.width = `${localViewportRect.width}px`;
    overlayRoot.style.height = `${localViewportRect.height}px`;
    mapLayer.style.transformOrigin = latestSnapshot.surfaceMotion.transformOriginCss;
    mapLayer.style.transform = latestSnapshot.surfaceMotion.transformCss;

    if (!hasOverlayImageSession(state)) {
      overlayImage.style.display = "none";
      overlayFrame.style.display = "none";
      overlayImage.removeAttribute("src");
      mapPinLayer.replaceChildren();
      pinLayer.replaceChildren();
      return;
    }
    const image = getOverlayImage(state);

    const transform = resolveOverlayScreenTransform({
      state,
      snapshot: latestSnapshot,
    });
    const model = buildOverlayRenderModel({
      image,
      transform,
      opacity: state.opacity,
    });

    overlayImage.style.display = "block";
    overlayFrame.style.display = "block";
    if (overlayImage.src !== image.src) {
      overlayImage.src = image.src;
    }
    const imageTopLeft = {
      x: model.left - viewportRect.left,
      y: model.top - viewportRect.top,
    };
    overlayImage.style.left = `${imageTopLeft.x}px`;
    overlayImage.style.top = `${imageTopLeft.y}px`;
    overlayImage.style.width = `${model.width}px`;
    overlayImage.style.height = `${model.height}px`;
    overlayImage.style.opacity = String(model.opacity);
    overlayImage.style.transformOrigin = "0 0";
    overlayImage.style.transform = `rotate(${model.rotationDeg}deg)`;
    overlayFrame.style.left = `${imageTopLeft.x}px`;
    overlayFrame.style.top = `${imageTopLeft.y}px`;
    overlayFrame.style.width = `${model.width}px`;
    overlayFrame.style.height = `${model.height}px`;
    overlayFrame.style.transformOrigin = "0 0";
    overlayFrame.style.transform = `rotate(${model.rotationDeg}deg)`;
    overlayFrame.style.pointerEvents = overlayOwnsPointerHitTesting ? "auto" : "none";

    // Final semantic-history shape: pin visibility should be projected from
    // canonical UI state. This direct policy check should not diverge from the
    // main-action and status affordance selectors.
    if (!registrationUi.canShowPins) {
      mapPinLayer.replaceChildren();
      pinLayer.replaceChildren();
      return;
    }

    renderPins(buildPinRenderModels({
      pins: state.registration.pins,
      transform,
      projectOverlayScreenPoint: (pinImagePx) => imagePointToScreenPoint({
        imagePoint: pinImagePx,
        transform,
      }),
      projectMapScreenPoint: projectMapPinScreenPoint,
    }));
  }

  function renderPins(renderedPins) {
    mapPinLayer.replaceChildren(
      ...renderedPins
        .filter((pin) => pin.mapScreenPx)
        .map(createMapPinMarker),
    );
    pinLayer.replaceChildren(...renderedPins.map(createOverlayPinMarker));
  }

  function createOverlayPinMarker(pin) {
    const marker = mountElement?.ownerDocument?.createElement("div") ?? document.createElement("div");
    marker.className = "id-overlay-pin";
    marker.style.left = `${pin.overlayScreenPx.x - latestSnapshot.viewportRect.left}px`;
    marker.style.top = `${pin.overlayScreenPx.y - latestSnapshot.viewportRect.top}px`;
    marker.textContent = String(pin.id);
    return marker;
  }

  function createMapPinMarker(pin) {
    const marker = mountElement?.ownerDocument?.createElement("div") ?? document.createElement("div");
    marker.className = "id-overlay-map-pin";
    marker.style.left = `${pin.mapScreenPx.x - latestSnapshot.viewportRect.left}px`;
    marker.style.top = `${pin.mapScreenPx.y - latestSnapshot.viewportRect.top}px`;
    marker.dataset.pinId = String(pin.id);
    marker.textContent = String(pin.id);
    return marker;
  }

  function projectMapPinScreenPoint(mapLatLon) {
    if (typeof pageAdapter.mapToOverlayLayerScreen !== "function") {
      return null;
    }
    return pageAdapter.mapToOverlayLayerScreen(mapLatLon);
  }

  function ensureOverlayMount() {
    const nextMountElement = latestSnapshot.mountElement;
    if (!nextMountElement) {
      return;
    }
    ensureOverlayStyles(nextMountElement.ownerDocument);
    if (mountElement === nextMountElement) {
      return;
    }
    detachWheelListener();
    overlayRoot.remove();
    nextMountElement.prepend(overlayRoot);
    mountElement = nextMountElement;
    attachWheelListener();
  }

  function toGlobalScreenPoint(event) {
    return pageAdapter.clientPointToScreen({
      x: event.clientX,
      y: event.clientY,
    });
  }

  return {
    destroy() {
      if (renderFrame !== null && typeof globalThis.cancelAnimationFrame === "function") {
        globalThis.cancelAnimationFrame(renderFrame);
      }
      detachGlobalPointerListeners();
      detachWheelListener();
      unsubscribeStore();
      unsubscribeViewport();
      unsubscribeInteractions();
      overlayRoot.remove();
    },
  };

  function attachWheelListener() {
    // Final semantic-history shape: listener attachment is adapter plumbing.
    // It should remain independent from semantic mode/history decisions, which
    // belong in transition handlers.
    if (!mountElement || wheelTarget === mountElement) {
      return;
    }
    mountElement.addEventListener("pointermove", handleMountedPointerMove, true);
    mountElement.addEventListener("pointerleave", handleMountedPointerLeave, true);
    mountElement.addEventListener("pointerdown", handleMountedPointerDown, true);
    mountElement.addEventListener("click", handleMountedClick, true);
    mountElement.addEventListener("dblclick", handleMountedDoubleClick, true);
    mountElement.addEventListener("wheel", handleMountedWheel, {
      capture: true,
      passive: false,
    });
    wheelTarget = mountElement;
  }

  function detachWheelListener() {
    if (!wheelTarget) {
      return;
    }
    wheelTarget.removeEventListener("pointermove", handleMountedPointerMove, true);
    wheelTarget.removeEventListener("pointerleave", handleMountedPointerLeave, true);
    wheelTarget.removeEventListener("pointerdown", handleMountedPointerDown, true);
    wheelTarget.removeEventListener("click", handleMountedClick, true);
    wheelTarget.removeEventListener("dblclick", handleMountedDoubleClick, true);
    wheelTarget.removeEventListener("wheel", handleMountedWheel, true);
    wheelTarget = null;
  }

  function handleMountedPointerMove(event) {
    runOverlayBoundary("mounted-pointer-move", event, () => {
      // Final semantic-history shape: this handler should only translate DOM
      // input into canonical pointer/gesture events. Policy decisions should
      // be delegated to shared selectors over canonical state.
      if (isForwardedMapGestureEvent(event)) {
        return;
      }
      if (hasPendingOverlayPointerSequence(pendingPointerSequence)) {
        return;
      }
      const screenPoint = toGlobalScreenPoint(event);
      if (isRuntimeDragging(latestRuntime)) {
        interactions.handlePointerMove?.(screenPoint);
        consumeOverlayEvent(event);
        return;
      }
      const state = store.getState();
      const pointerPolicy = resolveOverlayPointerMovePolicy({
        state,
        runtime: latestRuntime,
        isPointerOverOverlay: isScreenPointOverOverlay(screenPoint),
        buttons: event.buttons,
      });
      if (pointerPolicy.shouldTrackPointer) {
        interactions.handlePointerMove?.(screenPoint);
        return;
      }
      if (getRuntimePointerScreenPx(latestRuntime) || isRuntimePointerInsideImage(latestRuntime)) {
        interactions.handlePointerLeave?.();
      }
    });
  }

  function handleMountedPointerLeave() {
    runOverlayBoundary("mounted-pointer-leave", null, () => {
      if (isRuntimeDragging(latestRuntime)) {
        return;
      }
      interactions.handlePointerLeave?.();
    });
  }

  function handleMountedPointerDown(event) {
    runOverlayBoundary("mounted-pointer-down", event, () => {
      if (isForwardedMapGestureEvent(event)) {
        return;
      }
      const screenPoint = toGlobalScreenPoint(event);
      const state = store.getState();
      const pointerPolicy = resolveOverlayPointerSequencePolicy({
        state,
        runtime: latestRuntime,
        isPointerOverOverlay: isScreenPointOverOverlay(screenPoint),
        button: event.button,
        shiftKey: event.shiftKey,
      });
      if (!pointerPolicy.shouldOwnPointerSequence) {
        return;
      }
      setPendingPointerSequence(beginOverlayPointerSequence({
        button: event.button,
        dragMode: pointerPolicy.dragMode,
        startScreenPoint: screenPoint,
      }));
      consumeOverlayEvent(event);
    });
  }

  function handleMountedDoubleClick(event) {
    runOverlayBoundary("mounted-double-click", event, () => {
      if (isForwardedMapGestureEvent(event)) {
        return;
      }
      const screenPoint = toGlobalScreenPoint(event);
      const activationPolicy = resolveOverlayActivationPolicy({
        state: store.getState(),
        runtime: latestRuntime,
        isPointerOverOverlay: isScreenPointOverOverlay(screenPoint),
      });
      if (!activationPolicy.shouldTogglePin) {
        return;
      }
      const result = interactions.handleDoubleClick(screenPoint);
      consumeOverlayEvent(event);
      if (!result.ok) {
        return;
      }
    });
  }

  function handleMountedClick(event) {
    runOverlayBoundary("mounted-click", event, () => {
      if (isForwardedMapGestureEvent(event)) {
        return;
      }
      const screenPoint = toGlobalScreenPoint(event);
      const activationPolicy = resolveOverlayActivationPolicy({
        state: store.getState(),
        runtime: latestRuntime,
        isPointerOverOverlay: isScreenPointOverOverlay(screenPoint),
      });
      if (!activationPolicy.shouldConsumeClick) {
        return;
      }
      consumeOverlayEvent(event);
    });
  }

  function handleMountedWheel(event) {
    runOverlayBoundary("mounted-wheel", event, () => {
      // Final semantic-history shape: wheel handling currently mixes DOM
      // interception policy with semantic overlay edits. Keep interception in
      // the adapter and route edits through canonical events.
      if (isForwardedMapGestureEvent(event)) {
        return;
      }
      const screenPoint = toGlobalScreenPoint(event);
      if (!isScreenPointOverOverlay(screenPoint)) {
        return;
      }
      const state = store.getState();
      const wheelPolicy = resolveOverlayWheelPolicy({
        state,
        runtime: latestRuntime,
        shiftKey: event.shiftKey,
        altKey: event.altKey,
        ctrlKey: event.ctrlKey,
      });
      const overlayOwnsPointerHitTesting = doesOverlayOwnPointerHitTesting({
        state,
        runtime: latestRuntime,
      });
      if (!wheelPolicy.shouldIntercept && !overlayOwnsPointerHitTesting) {
        return;
      }
      if (!interactions.handleWheel({
        deltaY: event.deltaY,
        shiftKey: event.shiftKey,
        altKey: event.altKey,
        ctrlKey: event.ctrlKey,
        screenPoint,
      })) {
        return;
      }
      if (wheelPolicy.shouldIntercept || overlayOwnsPointerHitTesting) {
        consumeOverlayEvent(event);
      }
    });
  }

  function attachGlobalPointerListeners() {
    // Final semantic-history shape: global listener ownership should be driven
    // by raw drag runtime only. It should not become another semantic drag
    // state outside the UI machine.
    const nextWindow = mountElement?.ownerDocument?.defaultView ?? globalThis.window;
    if (!nextWindow || dragEventWindow === nextWindow) {
      return;
    }
    dragEventWindow = nextWindow;
    dragEventWindow.addEventListener("pointermove", handleGlobalPointerMove, true);
    dragEventWindow.addEventListener("pointerup", handleGlobalPointerUp, true);
    dragEventWindow.addEventListener("pointercancel", handleGlobalPointerCancel, true);
  }

  function detachGlobalPointerListeners() {
    if (!dragEventWindow) {
      return;
    }
    dragEventWindow.removeEventListener("pointermove", handleGlobalPointerMove, true);
    dragEventWindow.removeEventListener("pointerup", handleGlobalPointerUp, true);
    dragEventWindow.removeEventListener("pointercancel", handleGlobalPointerCancel, true);
    dragEventWindow = null;
  }

  function handleGlobalPointerMove(event) {
    runOverlayBoundary("global-pointer-move", event, () => {
      if (isForwardedMapGestureEvent(event)) {
        return;
      }
      const screenPoint = toGlobalScreenPoint(event);
      if (hasPendingOverlayPointerSequence(pendingPointerSequence)) {
        const activation = resolveOverlayPointerSequenceActivation({
          state: pendingPointerSequence,
          screenPoint,
        });
        if (!activation.shouldStartDrag) {
          consumeOverlayEvent(event);
          return;
        }
        const pendingSequence = activation.sequence;
        interactions.handlePointerMove?.(pendingSequence.startScreenPoint);
        if (!interactions.handlePointerDown({
          button: pendingSequence.button,
          screenPoint: pendingSequence.startScreenPoint,
          dragMode: pendingSequence.dragMode,
        })) {
          setPendingPointerSequence(clearOverlayPointerSequence());
          consumeOverlayEvent(event);
          return;
        }
        setPendingPointerSequence(clearOverlayPointerSequence());
      }
      if (!isRuntimeDragging(latestRuntime)) {
        syncGlobalPointerListeners();
        return;
      }
      interactions.handlePointerMove?.(screenPoint);
      consumeOverlayEvent(event);
    });
  }

  function handleGlobalPointerUp(event) {
    runOverlayBoundary("global-pointer-up", event, () => {
      if (isForwardedMapGestureEvent(event)) {
        return;
      }
      if (hasPendingOverlayPointerSequence(pendingPointerSequence)) {
        setPendingPointerSequence(clearOverlayPointerSequence());
        consumeOverlayEvent(event);
        return;
      }
      if (!isRuntimeDragging(latestRuntime)) {
        syncGlobalPointerListeners();
        return;
      }
      interactions.handlePointerUp?.(toGlobalScreenPoint(event));
      consumeOverlayEvent(event);
    });
  }

  function handleGlobalPointerCancel(event) {
    runOverlayBoundary("global-pointer-cancel", event, () => {
      if (isForwardedMapGestureEvent(event)) {
        return;
      }
      setPendingPointerSequence(clearOverlayPointerSequence());
      interactions.handlePointerCancel?.();
      consumeOverlayEvent(event);
    });
  }

  function isScreenPointOverOverlay(screenPoint) {
    const state = store.getState();
    if (!hasOverlayImageSession(state)) {
      return false;
    }
    const image = getOverlayImage(state);
    const transform = resolveOverlayScreenTransform({
      state,
      snapshot: latestSnapshot,
    });
    if (!transform) {
      return false;
    }
    const imagePoint = screenPointToRenderedImagePoint({
      screenPoint,
      transform,
      snapshot: latestSnapshot,
    });
    return isImagePointWithinBounds(imagePoint, image);
  }

  function runOverlayBoundary(operation, event, fn) {
    try {
      return fn();
    } catch (error) {
      setPendingPointerSequence(clearOverlayPointerSequence());
      syncGlobalPointerListeners();
      consumeOverlayEvent(event);
      interactions.reportRuntimeError?.({
        source: RUNTIME_ERROR_SOURCE.OVERLAY,
        operation,
        error,
        resetInteraction: true,
      });
      return undefined;
    }
  }

  function setPendingPointerSequence(nextState) {
    pendingPointerSequence = nextState;
    syncGlobalPointerListeners();
  }

  function syncGlobalPointerListeners() {
    const shouldListenGlobally = (
      hasPendingOverlayPointerSequence(pendingPointerSequence) ||
      isRuntimeDragging(latestRuntime)
    );
    if (shouldListenGlobally) {
      attachGlobalPointerListeners();
      return;
    }
    detachGlobalPointerListeners();
  }
}

function isForwardedMapGestureEvent(event) {
  return event?.[FORWARDED_MAP_GESTURE_EVENT_FLAG] === true;
}

function ensureOverlayStyles(targetDocument) {
  if (targetDocument.getElementById(OVERLAY_STYLE_ID)) {
    return;
  }
  const style = targetDocument.createElement("style");
  style.id = OVERLAY_STYLE_ID;
  style.textContent = OVERLAY_STYLE_TEXT;
  (targetDocument.head ?? targetDocument.documentElement ?? targetDocument.body).append(style);
}

function consumeOverlayEvent(event) {
  // Final semantic-history shape: event consumption is adapter output. Tests
  // should assert semantic ownership decisions, not these DOM calls directly
  // except at the adapter boundary.
  event?.preventDefault?.();
  event?.stopPropagation?.();
  event?.stopImmediatePropagation?.();
}

function doesOverlayOwnPointerHitTesting({ state, runtime, registrationUi = null }) {
  // Final semantic-history shape: overlay hit-testing ownership should be a
  // canonical affordance derived once from UI state/runtime, not a local
  // recomposition of registration policy plus pass-through.
  const resolvedRegistrationUi = registrationUi ?? resolveRegistrationUiPolicy(state);
  return resolvedRegistrationUi.canShowPins && !isRuntimePassThroughActive(runtime);
}
