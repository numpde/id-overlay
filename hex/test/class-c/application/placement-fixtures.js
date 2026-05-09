// Class-c placement specimens. These values are concrete enough to test visible
// behavior proposals, but they are not production geometry helpers.

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

export function placementEditPayload({ kind, placement }) {
  return {
    kind,
    placement,
  };
}

export function historyWithPast(...records) {
  return {
    past: records,
    future: [],
  };
}
