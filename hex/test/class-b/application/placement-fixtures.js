// Class-b placement specimens for application behavior tests. These are payload
// examples, not production geometry helpers.

export function movedPlacement() {
  return {
    x: 80,
    y: 40,
    scale: 1,
    rotationRad: 0,
  };
}

export function placementEditPayload({ kind, placement }) {
  return {
    kind,
    placement,
  };
}
