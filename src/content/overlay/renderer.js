import { createOverlayHost } from "./host.js";

export function createOverlayRenderer({
  getOverlayViewModel,
  getMountElement,
  onMountChange,
}) {
  // TODO(smell): Overlay rendering still hand-patches DOM nodes, CSS state,
  // image state, and pin list reconciliation in one renderer. Extract element
  // reconcilers before adding more overlay render surfaces.
  // TODO(smell): The final overlay renderer should compose viewport, image,
  // frame, and pin-layer reconcilers. This file should not know every style
  // mutation once the view model shape is stable.
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
    getMountElement,
    render,
    onMountChange,
  });

  return {
    getMountElement: host.getMountElement,
    scheduleRender: host.scheduleRender,
    destroy: host.destroy,
  };

  function render() {
    const viewModel = getOverlayViewModel();
    // TODO(smell): Viewport and live-map-layer presentation are separate
    // render domains but are patched together here.
    overlayRoot.dataset.mode = viewModel.viewport.mode;
    overlayRoot.dataset.passThrough = String(viewModel.viewport.isPassThrough);
    overlayRoot.style.left = `${viewModel.viewport.rect.left}px`;
    overlayRoot.style.top = `${viewModel.viewport.rect.top}px`;
    overlayRoot.style.width = `${viewModel.viewport.rect.width}px`;
    overlayRoot.style.height = `${viewModel.viewport.rect.height}px`;
    mapLayer.style.transformOrigin = viewModel.mapLayer.transformOriginCss;
    mapLayer.style.transform = viewModel.mapLayer.transformCss;

    if (!viewModel.image) {
      // TODO(smell): Empty-image cleanup is a hidden render-state transition.
      // A dedicated image reconciler should own src/display cleanup.
      overlayImage.style.display = "none";
      overlayFrame.style.display = "none";
      overlayImage.removeAttribute("src");
      mapPinLayer.replaceChildren();
      pinLayer.replaceChildren();
      return;
    }

    overlayImage.style.display = "block";
    overlayFrame.style.display = "block";
    // TODO(smell): Image and frame placement duplicate transform/style patching.
    // Keep this local until a shared placement-presenter can update both.
    if (overlayImage.src !== viewModel.image.src) {
      overlayImage.src = viewModel.image.src;
    }
    overlayImage.style.left = `${viewModel.image.left}px`;
    overlayImage.style.top = `${viewModel.image.top}px`;
    overlayImage.style.width = `${viewModel.image.width}px`;
    overlayImage.style.height = `${viewModel.image.height}px`;
    overlayImage.style.opacity = String(viewModel.image.opacity);
    overlayImage.style.transformOrigin = "0 0";
    overlayImage.style.transform = `rotate(${viewModel.image.rotationDeg}deg)`;
    overlayFrame.style.left = `${viewModel.frame.left}px`;
    overlayFrame.style.top = `${viewModel.frame.top}px`;
    overlayFrame.style.width = `${viewModel.frame.width}px`;
    overlayFrame.style.height = `${viewModel.frame.height}px`;
    overlayFrame.style.transformOrigin = "0 0";
    overlayFrame.style.transform = `rotate(${viewModel.frame.rotationDeg}deg)`;
    overlayFrame.style.pointerEvents = viewModel.frame.ownsPointerHitTesting ? "auto" : "none";

    renderPins(viewModel.pins);
  }

  function renderPins(pins) {
    // TODO(smell): Pin reconciliation is full replaceChildren on every render.
    // Fine for small pin counts, but the final renderer should key by pin id if
    // pins become more interactive or numerous.
    mapPinLayer.replaceChildren(
      ...pins.map.map(createMapPinMarker),
    );
    pinLayer.replaceChildren(...pins.overlay.map(createOverlayPinMarker));
  }

  function createOverlayPinMarker(pin) {
    const marker = host.getMountElement()?.ownerDocument?.createElement("div") ?? document.createElement("div");
    marker.className = "id-overlay-pin";
    marker.style.left = `${pin.left}px`;
    marker.style.top = `${pin.top}px`;
    marker.textContent = String(pin.id);
    return marker;
  }

  function createMapPinMarker(pin) {
    const marker = host.getMountElement()?.ownerDocument?.createElement("div") ?? document.createElement("div");
    marker.className = "id-overlay-map-pin";
    marker.style.left = `${pin.left}px`;
    marker.style.top = `${pin.top}px`;
    marker.dataset.pinId = String(pin.id);
    marker.textContent = String(pin.id);
    return marker;
  }
}
