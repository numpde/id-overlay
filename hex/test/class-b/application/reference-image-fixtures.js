// Class-b product specimens for reference-image behavior tests. These fixtures
// are intentionally test-local; they name likely application vocabulary without
// forcing production factories before implementation needs them.

export function normalizedReferenceImage() {
  return {
    imageDataRef: "reference-image-data-1",
    intrinsicSizePx: {
      width: 640,
      height: 480,
    },
  };
}

export function awaitingReferenceImagePasteState({ requestId = 1 } = {}) {
  return {
    referenceImageInput: {
      status: "awaiting-input",
      requestId,
    },
  };
}

export function referenceImageLoadedState({
  mode = "align",
  placement,
  opacity,
  pins,
} = {}) {
  const session = {
    mode,
    referenceImage: normalizedReferenceImage(),
  };
  if (placement !== undefined) {
    session.placement = placement;
  }
  if (opacity !== undefined) {
    session.opacity = opacity;
  }
  if (pins !== undefined) {
    session.registration = {
      pins,
    };
  }
  return {
    session,
  };
}

export function referenceImageDurableState({
  mode = "align",
  placement,
  opacity,
  pins,
} = {}) {
  return {
    session: referenceImageLoadedState({ mode, placement, opacity, pins }).session,
  };
}

export function firstPin() {
  return {
    id: 1,
    imagePx: {
      x: 320,
      y: 240,
    },
    mapLatLon: {
      lat: -1.23,
      lon: 36.84,
    },
  };
}

export function secondPin() {
  return {
    id: 2,
    imagePx: {
      x: 520,
      y: 240,
    },
    mapLatLon: {
      lat: -1.23,
      lon: 38.84,
    },
  };
}

export function twoPins() {
  return [
    firstPin(),
    secondPin(),
  ];
}

export function solvedPlacement() {
  return {
    x: 120,
    y: 90,
    scale: 1.25,
    rotationRad: 0.1,
  };
}

export function pinTogglePayload({
  existingPinId = null,
  imagePx = firstPin().imagePx,
  mapLatLon = firstPin().mapLatLon,
} = {}) {
  return {
    existingPinId,
    imagePx,
    mapLatLon,
  };
}

export function acceptedReferenceImageInputPayload({ requestId = 1 } = {}) {
  return {
    requestId,
    outcome: {
      kind: "accepted",
      referenceImage: normalizedReferenceImage(),
    },
  };
}

export function persistDurableStateEffect(durableState) {
  return {
    kind: "persist-durable-state",
    durableState,
  };
}
