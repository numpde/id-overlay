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
import { getOverlayImage, hasOverlayImageSession } from "../core/session.js";
import {
  selectIsRuntimeDragging,
  selectOverlayPresentation,
  selectRuntimePointerScreenPx,
} from "../core/machine/selectors.js";
import { resolveInputProjection } from "../core/input-projection.js";
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

export function createOverlay({ pageAdapter, machineHost, interactions }) {
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

  const unsubscribeMachine = machineHost.subscribe(scheduleRender);
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

    const machineState = getMachineState();
    const state = machineState.session;
    const viewportRect = latestSnapshot.viewportRect;
    const localViewportRect = latestSnapshot.localViewportRect ?? viewportRect;
    const overlayPresentation = selectOverlayPresentation(
      machineState,
      latestRuntime,
    );
    overlayRoot.dataset.mode = state.mode;
    overlayRoot.dataset.passThrough = String(overlayPresentation.isPassThrough);
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
      state: machineState,
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
    overlayFrame.style.pointerEvents = overlayPresentation.ownsPointerHitTesting ? "auto" : "none";

    if (!overlayPresentation.arePinsVisible) {
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

  function getMachineState() {
    return machineHost.getState();
  }

  function resolveMountedInputProjection(screenPoint, options = {}) {
    return resolveInputProjection(resolveMountedInputFacts(screenPoint, options));
  }

  function resolveMountedInputFacts(screenPoint, options = {}) {
    return {
      machineState: getMachineState(),
      runtime: latestRuntime,
      isPointerOverOverlay: isScreenPointOverOverlay(screenPoint),
      ...options,
    };
  }

  return {
    destroy() {
      if (renderFrame !== null && typeof globalThis.cancelAnimationFrame === "function") {
        globalThis.cancelAnimationFrame(renderFrame);
      }
      detachGlobalPointerListeners();
      detachWheelListener();
      unsubscribeMachine();
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
      if (selectIsRuntimeDragging(latestRuntime)) {
        interactions.handlePointerMove?.(screenPoint);
        consumeOverlayEvent(event);
        return;
      }
      const pointerPolicy = resolveMountedInputProjection(screenPoint, {
        buttons: event.buttons,
      }).pointerMove;
      if (pointerPolicy.shouldTrackPointer) {
        interactions.handlePointerMove?.(screenPoint);
        return;
      }
      if (selectRuntimePointerScreenPx(latestRuntime)) {
        interactions.handlePointerLeave?.();
      }
    });
  }

  function handleMountedPointerLeave() {
    runOverlayBoundary("mounted-pointer-leave", null, () => {
      if (selectIsRuntimeDragging(latestRuntime)) {
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
      const pointerPolicy = resolveMountedInputProjection(screenPoint, {
        button: event.button,
        shiftKey: event.shiftKey,
      }).pointerSequence;
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
      const activationPolicy = resolveMountedInputProjection(screenPoint).activation;
      if (!activationPolicy.shouldTogglePin) {
        return;
      }
      if (!interactions.handleTogglePin({ screenPoint })) {
        return;
      }
      consumeOverlayEvent(event);
    });
  }

  function handleMountedClick(event) {
    runOverlayBoundary("mounted-click", event, () => {
      if (isForwardedMapGestureEvent(event)) {
        return;
      }
      const screenPoint = toGlobalScreenPoint(event);
      const activationPolicy = resolveMountedInputProjection(screenPoint).activation;
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
      const wheelPolicy = resolveMountedInputProjection(screenPoint, {
        shiftKey: event.shiftKey,
        altKey: event.altKey,
        ctrlKey: event.ctrlKey,
      }).wheel;
      if (!wheelPolicy.shouldHandle) {
        return;
      }
      if (!interactions.handleWheel({
        deltaY: event.deltaY,
        wheelMode: wheelPolicy.wheelMode,
        screenPoint,
      })) {
        return;
      }
      if (wheelPolicy.shouldConsume) {
        consumeOverlayEvent(event);
      }
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
      if (!advancePendingPointerSequence(event, screenPoint)) {
        return;
      }
      if (!selectIsRuntimeDragging(latestRuntime)) {
        syncGlobalPointerListeners();
        return;
      }
      interactions.handlePointerMove?.(screenPoint);
      consumeOverlayEvent(event);
    });
  }

  function advancePendingPointerSequence(event, screenPoint) {
    if (!hasPendingOverlayPointerSequence(pendingPointerSequence)) {
      return true;
    }
    const activation = resolveOverlayPointerSequenceActivation({
      state: pendingPointerSequence,
      screenPoint,
    });
    if (!activation.shouldStartDrag) {
      consumeOverlayEvent(event);
      return false;
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
      return false;
    }
    setPendingPointerSequence(clearOverlayPointerSequence());
    return true;
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
      if (!selectIsRuntimeDragging(latestRuntime)) {
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
    const machineState = getMachineState();
    const state = machineState.session;
    if (!hasOverlayImageSession(state)) {
      return false;
    }
    const image = getOverlayImage(state);
    const transform = resolveOverlayScreenTransform({
      state: machineState,
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
      selectIsRuntimeDragging(latestRuntime)
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
