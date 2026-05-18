export const OVERLAY_DOM_CLASS = Object.freeze({
  viewport: "id-overlay-viewport",
  mapLayer: "id-overlay-map-layer",
  image: "id-overlay-image",
  frame: "id-overlay-frame",
  mapPinLayer: "id-overlay-map-pin-layer",
  mapPinAnchor: "id-overlay-map-pin",
  mapPinMarker: "id-overlay-map-pin__marker",
  pinLayer: "id-overlay-pin-layer",
  overlayPin: "id-overlay-pin",
});

export const OVERLAY_DOM_SELECTOR = Object.freeze(
  Object.fromEntries(
    Object.entries(OVERLAY_DOM_CLASS).map(([key, className]) => [key, `.${className}`]),
  ),
);
