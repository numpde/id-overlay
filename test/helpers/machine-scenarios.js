import {
  MACHINE_PLACEMENT_EDIT_KIND,
} from "../../src/core/machine/events.js";
import { createMachineHost } from "../../src/core/machine/host.js";
import { PLACEMENT_EDIT_PLAN_PHASE } from "../../src/core/placement-edit-planning.js";
import {
  IMAGE,
  MOVED_PLACEMENT,
  NORMALIZED_IMAGE,
  PLACEMENT,
} from "./session-fixtures.js";

export {
  IMAGE,
  MOVED_PLACEMENT,
  NORMALIZED_IMAGE,
  PLACEMENT,
};

export function createHost(options = {}) {
  return createMachineHost(options);
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
