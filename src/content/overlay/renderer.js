import {
  buildOverlayRenderModel,
  buildPinRenderModels,
  imagePointToScreenPoint,
  resolveOverlayScreenTransform,
} from "../../core/transform.js";
import { getOverlayImage, hasOverlayImageSession } from "../../core/session.js";
import { selectOverlayPresentation } from "../../core/machine/selectors.js";

const OVERLAY_STYLE_ID = "id-overlay-map-styles";
// TODO(smell): Overlay CSS lives in JS because it must be injected into the
// current page or iframe document after remounts. Replace this with a generated
// style asset plus document-scoped injector before expanding overlay styling.
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

export function createOverlayRenderer({
  pageAdapter,
  getMachineState,
  getRuntimeState,
  getSnapshot,
  onMountChange,
}) {
  // TODO(smell): Rendering still owns mount retargeting, RAF scheduling,
  // model-to-DOM patching, and pin marker creation. Split mount/scheduler
  // mechanics from render patching before adding another visual layer.
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

  let renderFrame = null;
  let mountElement = null;

  return {
    getMountElement() {
      return mountElement;
    },

    scheduleRender,

    destroy() {
      if (renderFrame !== null && typeof globalThis.cancelAnimationFrame === "function") {
        globalThis.cancelAnimationFrame(renderFrame);
      }
      overlayRoot.remove();
      mountElement = null;
      onMountChange?.(null);
    },
  };

  function scheduleRender() {
    if (renderFrame !== null) {
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
    const snapshot = getSnapshot();
    const viewportRect = snapshot.viewportRect;
    const localViewportRect = snapshot.localViewportRect ?? viewportRect;
    const overlayPresentation = selectOverlayPresentation(
      machineState,
      getRuntimeState(),
    );
    overlayRoot.dataset.mode = state.mode;
    overlayRoot.dataset.passThrough = String(overlayPresentation.isPassThrough);
    overlayRoot.style.left = `${localViewportRect.left}px`;
    overlayRoot.style.top = `${localViewportRect.top}px`;
    overlayRoot.style.width = `${localViewportRect.width}px`;
    overlayRoot.style.height = `${localViewportRect.height}px`;
    mapLayer.style.transformOrigin = snapshot.surfaceMotion.transformOriginCss;
    mapLayer.style.transform = snapshot.surfaceMotion.transformCss;

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
      snapshot,
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
    const snapshot = getSnapshot();
    const marker = mountElement?.ownerDocument?.createElement("div") ?? document.createElement("div");
    marker.className = "id-overlay-pin";
    marker.style.left = `${pin.overlayScreenPx.x - snapshot.viewportRect.left}px`;
    marker.style.top = `${pin.overlayScreenPx.y - snapshot.viewportRect.top}px`;
    marker.textContent = String(pin.id);
    return marker;
  }

  function createMapPinMarker(pin) {
    const snapshot = getSnapshot();
    const marker = mountElement?.ownerDocument?.createElement("div") ?? document.createElement("div");
    marker.className = "id-overlay-map-pin";
    marker.style.left = `${pin.mapScreenPx.x - snapshot.viewportRect.left}px`;
    marker.style.top = `${pin.mapScreenPx.y - snapshot.viewportRect.top}px`;
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
    const nextMountElement = getSnapshot().mountElement;
    if (!nextMountElement) {
      return;
    }
    ensureOverlayStyles(nextMountElement.ownerDocument);
    if (mountElement === nextMountElement) {
      return;
    }
    overlayRoot.remove();
    nextMountElement.prepend(overlayRoot);
    mountElement = nextMountElement;
    onMountChange?.(mountElement);
  }
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
