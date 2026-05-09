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

export function referenceImageDurableState({ pins } = {}) {
  const session = {
    ...referenceImageSessionState().session,
  };
  if (pins !== undefined) {
    session.registration = {
      pins,
    };
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

export function referenceImageLoadedState({
  pins = [],
  panelIntent = null,
  notice = null,
} = {}) {
  return {
    session: {
      ...referenceImageSessionState().session,
      registration: {
        pins,
      },
    },
    panelIntent,
    notice,
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
