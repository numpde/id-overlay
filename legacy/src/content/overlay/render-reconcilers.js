export function createViewportReconciler({
  root,
  mapLayer,
}) {
  return function reconcileViewport({
    viewport,
    mapLayer: mapLayerView,
  }) {
    root.dataset.mode = viewport.mode;
    root.dataset.passThrough = String(viewport.isPassThrough);
    root.style.left = `${viewport.rect.left}px`;
    root.style.top = `${viewport.rect.top}px`;
    root.style.width = `${viewport.rect.width}px`;
    root.style.height = `${viewport.rect.height}px`;
    mapLayer.style.transformOrigin = mapLayerView.transformOriginCss;
    mapLayer.style.transform = mapLayerView.transformCss;
  };
}

export function createImageFrameReconciler({
  imageElement,
  frameElement,
}) {
  return function reconcileImageFrame({
    image,
    frame,
  }) {
    if (!image || !frame) {
      imageElement.style.display = "none";
      frameElement.style.display = "none";
      imageElement.removeAttribute("src");
      return;
    }

    imageElement.style.display = "block";
    frameElement.style.display = "block";
    if (imageElement.src !== image.src) {
      imageElement.src = image.src;
    }
    applyPlacementBox(imageElement, image);
    imageElement.style.opacity = String(image.opacity);
    applyPlacementBox(frameElement, frame);
    frameElement.style.pointerEvents = frame.ownsPointerHitTesting ? "auto" : "none";
  };
}

export function createPinLayerReconciler({
  mapPinLayer,
  pinLayer,
}) {
  return function reconcilePinLayer(pins) {
    mapPinLayer.replaceChildren(
      ...pins.map.map((pin) => createMapPinMarker(mapPinLayer.ownerDocument, pin)),
    );
    pinLayer.replaceChildren(
      ...pins.overlay.map((pin) => createOverlayPinMarker(pinLayer.ownerDocument, pin)),
    );
  };
}

function applyPlacementBox(element, box) {
  element.style.left = `${box.left}px`;
  element.style.top = `${box.top}px`;
  element.style.width = `${box.width}px`;
  element.style.height = `${box.height}px`;
  element.style.transformOrigin = "0 0";
  element.style.transform = `rotate(${box.rotationDeg}deg)`;
}

function createOverlayPinMarker(ownerDocument, pin) {
  const marker = ownerDocument.createElement("div");
  marker.className = "id-overlay-pin";
  marker.style.left = `${pin.left}px`;
  marker.style.top = `${pin.top}px`;
  marker.textContent = String(pin.id);
  return marker;
}

function createMapPinMarker(ownerDocument, pin) {
  const marker = ownerDocument.createElement("div");
  marker.className = "id-overlay-map-pin";
  marker.style.left = `${pin.left}px`;
  marker.style.top = `${pin.top}px`;
  marker.dataset.pinId = String(pin.id);
  marker.textContent = String(pin.id);
  return marker;
}
