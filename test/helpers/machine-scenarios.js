import {
  MACHINE_PLACEMENT_EDIT_KIND,
} from "../../src/core/machine/events.js";
import { createMachineHost } from "../../src/core/machine/host.js";
import { PLACEMENT_EDIT_PLAN_PHASE } from "../../src/core/placement-edit-planning.js";
import { normalizeSessionImage } from "../../src/core/session.js";

export const IMAGE = Object.freeze({
  src: "data:image/png;base64,abc",
  width: 800,
  height: 400,
});

export const NORMALIZED_IMAGE = normalizeSessionImage(IMAGE);

export const PLACEMENT = Object.freeze({
  type: "similarity",
  a: 1,
  b: 0,
  tx: 10,
  ty: 20,
  scale: 1,
  rotationRad: 0,
});

export const MOVED_PLACEMENT = Object.freeze({
  ...PLACEMENT,
  tx: 40,
  ty: 10,
});

export function createHost({ persistedSession = null } = {}) {
  return createMachineHost({ persistedSession });
}

export function createLoadedHost() {
  const host = createHost();
  loadImage(host);
  return host;
}

export function state(host) {
  return host.getState();
}

export function loadImage(host) {
  return host.loadImage({
    image: IMAGE,
    placement: PLACEMENT,
  });
}

export function addPin(host, {
  imagePx = { x: 400, y: 200 },
  mapLatLon = { lat: -1.23, lon: 36.84 },
  existingPinId = null,
  preservedPlacement = null,
} = {}) {
  return host.togglePin({
    imagePx,
    mapLatLon,
    existingPinId,
    preservedPlacement,
  });
}

export function addTwoPins(host) {
  addPin(host, {
    imagePx: { x: 400, y: 200 },
    mapLatLon: { lat: -1.23, lon: 36.84 },
  });
  return addPin(host, {
    imagePx: { x: 600, y: 200 },
    mapLatLon: { lat: -1.23, lon: 38.84 },
  });
}

export function createTwoPins() {
  return [
    {
      id: 1,
      imagePx: { x: 400, y: 200 },
      mapLatLon: { lat: -1.23, lon: 36.84 },
    },
    {
      id: 2,
      imagePx: { x: 600, y: 200 },
      mapLatLon: { lat: -1.23, lon: 38.84 },
    },
  ];
}

export function applyPlacement(host, {
  editKind = MACHINE_PLACEMENT_EDIT_KIND.MOVE,
  renderedPlacement = PLACEMENT,
  placement = MOVED_PLACEMENT,
} = {}) {
  return host.applyPlacementEditPlan({
    phase: PLACEMENT_EDIT_PLAN_PHASE.APPLY,
    kind: editKind,
    renderedPlacement,
    placement,
  });
}

export function beginPlacementEdit(host, {
  editKind = MACHINE_PLACEMENT_EDIT_KIND.MOVE,
  renderedPlacement = PLACEMENT,
} = {}) {
  return host.applyPlacementEditPlan({
    phase: PLACEMENT_EDIT_PLAN_PHASE.BEGIN,
    kind: editKind,
    renderedPlacement,
  });
}

export function previewPlacementEdit(host, placement = MOVED_PLACEMENT) {
  return host.applyPlacementEditPlan({
    phase: PLACEMENT_EDIT_PLAN_PHASE.PREVIEW,
    placement,
  });
}
