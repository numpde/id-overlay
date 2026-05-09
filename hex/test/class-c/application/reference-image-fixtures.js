// Shared only for concrete reference-image specimens used across application
// tests. These are not production factories; they keep cross-test product
// vocabulary single-sourced without turning fixtures into architecture.

export function awaitingReferenceImagePasteState() {
  return {
    referenceImageInput: {
      status: "awaiting-paste",
    },
  };
}

export function normalizedReferenceImage() {
  return {
    imageDataRef: "reference-image-data-1",
    intrinsicSizePx: {
      width: 640,
      height: 480,
    },
  };
}

export function referenceImageSessionState() {
  return {
    session: {
      mode: "align",
      referenceImage: normalizedReferenceImage(),
    },
  };
}

export function referenceImageDurableState({
  mode = "align",
  placement,
  pins,
  solved,
} = {}) {
  const session = {
    ...referenceImageSessionState().session,
    mode,
  };
  if (placement !== undefined) {
    session.placement = placement;
  }
  if (pins !== undefined) {
    session.registration = {
      pins,
    };
    if (solved !== undefined) {
      session.registration.solvedPlacement = solved;
    }
  }
  return {
    session,
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

export function referenceImageLoadedState({
  mode = "align",
  placement,
  pins = [],
  solved,
  history,
  panelIntent = null,
  notice = null,
} = {}) {
  const session = {
    ...referenceImageSessionState().session,
    mode,
    registration: {
      pins,
    },
  };
  if (placement !== undefined) {
    session.placement = placement;
  }
  if (solved !== undefined) {
    session.registration.solvedPlacement = solved;
  }
  return {
    session,
    panelIntent,
    notice,
    ...(history === undefined ? {} : { history }),
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
