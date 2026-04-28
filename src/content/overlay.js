import {
  buildOverlayRenderModel,
  buildPinRenderModels,
  resolveOverlayScreenTransform,
} from "../core/transform.js";

export function createOverlay({ shadow, pageAdapter, store, interactions, statusController }) {
  const overlayRoot = document.createElement("div");
  overlayRoot.className = "id-overlay-viewport";
  overlayRoot.dataset.idOverlayOwned = "true";

  const mapLayer = document.createElement("div");
  mapLayer.className = "id-overlay-map-layer";

  const overlayImage = document.createElement("img");
  overlayImage.className = "id-overlay-image";
  overlayImage.alt = "";
  overlayImage.decoding = "async";

  const pinLayer = document.createElement("div");
  pinLayer.className = "id-overlay-pin-layer";

  const statusElement = document.createElement("div");
  statusElement.className = "id-overlay-status";

  mapLayer.append(overlayImage, pinLayer);
  overlayRoot.append(mapLayer, statusElement);
  shadow.append(overlayRoot);

  let latestSnapshot = pageAdapter.getSnapshot();
  let latestRuntime = interactions.getRuntimeState();
  let renderFrame = null;

  overlayImage.addEventListener("pointerenter", (event) => {
    interactions.handlePointerEnter(toScreenPoint(event));
  });
  overlayImage.addEventListener("pointerleave", () => {
    interactions.handlePointerLeave();
  });
  overlayImage.addEventListener("pointermove", (event) => {
    interactions.handlePointerMove(toScreenPoint(event));
  });
  overlayImage.addEventListener("pointerdown", (event) => {
    if (!interactions.handlePointerDown({
      button: event.button,
      screenPoint: toScreenPoint(event),
      shiftKey: event.shiftKey,
    })) {
      return;
    }
    overlayImage.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  });
  overlayImage.addEventListener("pointerup", (event) => {
    interactions.handlePointerUp(toScreenPoint(event));
    overlayImage.releasePointerCapture?.(event.pointerId);
  });
  overlayImage.addEventListener("pointercancel", () => {
    interactions.handlePointerCancel();
  });
  overlayImage.addEventListener("wheel", (event) => {
    if (!interactions.handleWheel({
      deltaY: event.deltaY,
      shiftKey: event.shiftKey,
      screenPoint: toScreenPoint(event),
    })) {
      return;
    }
    event.preventDefault();
  }, { passive: false });
  overlayImage.addEventListener("dblclick", (event) => {
    const result = interactions.handleDoubleClick(toScreenPoint(event));
    if (!result.ok) {
      return;
    }
    event.preventDefault();
    event.stopPropagation?.();
    event.stopImmediatePropagation?.();
  });

  const unsubscribeStore = store.subscribe(scheduleRender);
  const unsubscribeViewport = pageAdapter.subscribe((nextSnapshot) => {
    latestSnapshot = nextSnapshot;
    scheduleRender();
  });
  const unsubscribeInteractions = interactions.subscribe((runtime) => {
    latestRuntime = runtime;
    scheduleRender();
  });
  const unsubscribeStatus = statusController.subscribe((message) => {
    statusElement.textContent = message;
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
    const state = store.getState();
    const viewportRect = latestSnapshot.viewportRect;
    overlayRoot.dataset.mode = state.mode;
    overlayRoot.dataset.passThrough = String(latestRuntime.isPassThroughActive);
    overlayRoot.classList.toggle("id-overlay-viewport--interactive", latestRuntime.canCapturePointer);
    mapLayer.style.left = `${viewportRect.left}px`;
    mapLayer.style.top = `${viewportRect.top}px`;
    mapLayer.style.width = `${viewportRect.width}px`;
    mapLayer.style.height = `${viewportRect.height}px`;
    mapLayer.style.transformOrigin = latestSnapshot.surfaceMotion.transformOriginCss;
    mapLayer.style.transform = latestSnapshot.surfaceMotion.transformCss;

    if (!state.image) {
      overlayImage.style.display = "none";
      overlayImage.removeAttribute("src");
      pinLayer.replaceChildren();
      return;
    }

    const transform = resolveOverlayScreenTransform({
      state,
      snapshot: latestSnapshot,
      mapToScreen: pageAdapter.mapToScreen,
    });
    const model = buildOverlayRenderModel({
      image: state.image,
      transform,
      opacity: state.opacity,
    });

    overlayImage.style.display = "block";
    if (overlayImage.src !== state.image.src) {
      overlayImage.src = state.image.src;
    }
    const imageTopLeft = toViewportLocalPoint({ x: model.left, y: model.top });
    overlayImage.style.left = `${imageTopLeft.x}px`;
    overlayImage.style.top = `${imageTopLeft.y}px`;
    overlayImage.style.width = `${model.width}px`;
    overlayImage.style.height = `${model.height}px`;
    overlayImage.style.opacity = String(model.opacity);
    overlayImage.style.transformOrigin = "0 0";
    overlayImage.style.transform = `rotate(${model.rotationDeg}deg)`;

    renderPins(buildPinRenderModels({
      pins: state.registration.pins,
      transform,
    }));
  }

  function renderPins(renderedPins) {
    pinLayer.replaceChildren(...renderedPins.map(createPinMarker));
  }

  function createPinMarker(pin) {
    const marker = document.createElement("div");
    marker.className = "id-overlay-pin";
    const localPoint = toViewportLocalPoint(pin.screenPx);
    marker.style.left = `${localPoint.x}px`;
    marker.style.top = `${localPoint.y}px`;
    marker.textContent = String(pin.id);
    return marker;
  }

  function toViewportLocalPoint(screenPoint) {
    return {
      x: screenPoint.x - latestSnapshot.viewportRect.left,
      y: screenPoint.y - latestSnapshot.viewportRect.top,
    };
  }

  function toScreenPoint(event) {
    return {
      x: event.clientX,
      y: event.clientY,
    };
  }

  return {
    destroy() {
      if (renderFrame !== null && typeof globalThis.cancelAnimationFrame === "function") {
        globalThis.cancelAnimationFrame(renderFrame);
      }
      unsubscribeStore();
      unsubscribeViewport();
      unsubscribeInteractions();
      unsubscribeStatus();
      overlayRoot.remove();
    },
  };
}
