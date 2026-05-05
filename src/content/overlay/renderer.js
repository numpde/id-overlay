import {
  buildOverlayRenderModel,
  buildPinRenderModels,
  imagePointToScreenPoint,
  resolveOverlayScreenTransform,
} from "../../core/transform.js";
import { getOverlayImage, hasOverlayImageSession } from "../../core/session.js";
import { selectOverlayPresentation } from "../../core/machine/selectors.js";
import { createOverlayHost } from "./host.js";

export function createOverlayRenderer({
  pageProjection,
  getMachineState,
  getRuntimeState,
  getSnapshot,
  onMountChange,
}) {
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

  const host = createOverlayHost({
    root: overlayRoot,
    getMountElement: () => getSnapshot().mountElement,
    render,
    onMountChange,
  });

  return {
    getMountElement: host.getMountElement,
    scheduleRender: host.scheduleRender,
    destroy: host.destroy,
  };

  function render() {
    // TODO(smell): Rendering still resolves presentation policy, geometry, DOM
    // style patches, and pin element construction in one pass. Extract a pure
    // overlay view model so this module only reconciles DOM nodes.
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
    const marker = host.getMountElement()?.ownerDocument?.createElement("div") ?? document.createElement("div");
    marker.className = "id-overlay-pin";
    marker.style.left = `${pin.overlayScreenPx.x - snapshot.viewportRect.left}px`;
    marker.style.top = `${pin.overlayScreenPx.y - snapshot.viewportRect.top}px`;
    marker.textContent = String(pin.id);
    return marker;
  }

  function createMapPinMarker(pin) {
    const snapshot = getSnapshot();
    const marker = host.getMountElement()?.ownerDocument?.createElement("div") ?? document.createElement("div");
    marker.className = "id-overlay-map-pin";
    marker.style.left = `${pin.mapScreenPx.x - snapshot.viewportRect.left}px`;
    marker.style.top = `${pin.mapScreenPx.y - snapshot.viewportRect.top}px`;
    marker.dataset.pinId = String(pin.id);
    marker.textContent = String(pin.id);
    return marker;
  }

  function projectMapPinScreenPoint(mapLatLon) {
    // TODO(smell): Renderer reaches into page projection for per-pin map
    // projection during DOM reconciliation. The final overlay view model should
    // receive already-projected render facts so rendering has no page-projection
    // dependency.
    if (typeof pageProjection.mapToOverlayLayerScreen !== "function") {
      return null;
    }
    return pageProjection.mapToOverlayLayerScreen(mapLatLon);
  }
}
