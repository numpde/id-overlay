// Proposal fixtures for user-facing behavior tests. These are deliberately
// test-local: they name the intended product facts without creating production
// factories before the application model earns them.

export const APPLICATION_MODE = {
  TRACE: "trace",
  ALIGN: "align",
};

export const REFERENCE_IMAGE_DATA_REF = "reference-image-data-1";

export function normalizedReferenceImage() {
  return {
    imageDataRef: REFERENCE_IMAGE_DATA_REF,
    intrinsicSizePx: {
      width: 640,
      height: 480,
    },
  };
}

export function identityPlacement() {
  return {
    x: 0,
    y: 0,
    scale: 1,
    rotationRad: 0,
  };
}

export function movedPlacement() {
  return {
    x: 80,
    y: 40,
    scale: 1,
    rotationRad: 0,
  };
}

export function rotatedPlacement() {
  return {
    x: 80,
    y: 40,
    scale: 1,
    rotationRad: Math.PI / 4,
  };
}

export function scaledPlacement() {
  return {
    x: 80,
    y: 40,
    scale: 1.5,
    rotationRad: 0,
  };
}

export function solvedPlacement() {
  return {
    x: 120,
    y: 90,
    scale: 1.25,
    rotationRad: 0.1,
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

export function awaitingReferenceImagePasteState({ requestId = 1 } = {}) {
  return {
    referenceImageInput: {
      status: "awaiting-paste",
      requestId,
    },
  };
}

export function referenceImageLoadedState({
  mode = APPLICATION_MODE.ALIGN,
  placement = identityPlacement(),
  pins = [],
  solved = null,
  opacity = 1,
  panelIntent = null,
  notice = null,
  history = emptyHistory(),
} = {}) {
  return {
    session: {
      mode,
      referenceImage: normalizedReferenceImage(),
      placement,
      registration: {
        pins,
        solvedPlacement: solved,
      },
      opacity,
    },
    panelIntent,
    notice,
    history,
  };
}

export function referenceImageDurableState({
  mode = APPLICATION_MODE.ALIGN,
  placement = identityPlacement(),
  pins = [],
  solved = null,
  opacity = 1,
} = {}) {
  return {
    session: {
      mode,
      referenceImage: normalizedReferenceImage(),
      placement,
      registration: {
        pins,
        solvedPlacement: solved,
      },
      opacity,
    },
  };
}

export function emptyHistory() {
  return {
    past: [],
    future: [],
  };
}

export function historyWithPast(...records) {
  return {
    past: records,
    future: [],
  };
}

export function durableStateChangedEffect(durableState) {
  return {
    kind: "durable-state-changed",
    durableState,
  };
}

export function acceptedReferenceImagePastePayload({ requestId = 1 } = {}) {
  return {
    requestId,
    outcome: {
      kind: "accepted",
      referenceImage: normalizedReferenceImage(),
    },
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

export function placementEditPayload({ kind, placement }) {
  return {
    kind,
    placement,
  };
}
