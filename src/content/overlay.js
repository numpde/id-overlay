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

  const pinLayer = document.createElement("div");
  pinLayer.className = "id-overlay-pin-layer";

  mapLayer.append(overlayImage, overlayFrame, pinLayer);
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
    overlayRoot.dataset.mode = state.mode;
    overlayRoot.dataset.passThrough = String(latestRuntime.isPassThroughActive);
    overlayRoot.classList.toggle("id-overlay-viewport--interactive", latestRuntime.canCapturePointer);
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

    renderPins(buildPinRenderModels({
      pins: state.registration.pins,
      transform,
      projectScreenPoint: (pinImagePx) => imagePointToScreenPoint({
        imagePoint: pinImagePx,
        transform,
      }),
    }));
  }

  function renderPins(renderedPins) {
    pinLayer.replaceChildren(...renderedPins.map(createPinMarker));
  }

  function createPinMarker(pin) {
    const marker = mountElement?.ownerDocument?.createElement("div") ?? document.createElement("div");
    marker.className = "id-overlay-pin";
    marker.style.left = `${pin.screenPx.x - latestSnapshot.viewportRect.left}px`;
    marker.style.top = `${pin.screenPx.y - latestSnapshot.viewportRect.top}px`;
    marker.textContent = String(pin.id);
    return marker;
  }

  function ensureOverlayMount() {
    const nextMountElement = pageAdapter.getOverlayMountElement?.();
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
      if (isForwardedMapGestureEvent(event)) {
        return;
      }
      if (hasPendingOverlayPointerSequence(pendingPointerSequence)) {
        return;
      }
      const screenPoint = toGlobalScreenPoint(event);
      if (latestRuntime.isDragging) {
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
      if (latestRuntime.pointerScreenPx || latestRuntime.isPointerInsideImage) {
        interactions.handlePointerLeave?.();
      }
    });
  }

  function handleMountedPointerLeave() {
    runOverlayBoundary("mounted-pointer-leave", null, () => {
      if (latestRuntime.isDragging) {
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
      if (!wheelPolicy.shouldIntercept) {
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
      consumeOverlayEvent(event);
    });
  }

  function attachGlobalPointerListeners() {
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
      if (!latestRuntime.isDragging) {
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
      if (!latestRuntime.isDragging) {
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
      latestRuntime.isDragging
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
  event?.preventDefault?.();
  event?.stopPropagation?.();
  event?.stopImmediatePropagation?.();
}
