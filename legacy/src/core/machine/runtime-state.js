import {
  MACHINE_INPUT_OVERRIDE,
  MACHINE_PLACEMENT_EDIT_KIND,
  MACHINE_POINTER_GESTURE_KIND,
} from "./events.js";
import {
  normalizePlacement,
  normalizeRegistration,
} from "../session.js";

export function createInitialRuntime() {
  return {
    pointer: {
      screenPx: null,
    },
    activeGesture: null,
    inputOverride: null,
    placementEdit: null,
  };
}

export function normalizeRuntime(runtime = {}) {
  return {
    pointer: {
      screenPx: normalizePoint(runtime.pointer?.screenPx),
    },
    activeGesture: normalizeActiveGesture(runtime.activeGesture),
    inputOverride: normalizeInputOverride(runtime.inputOverride),
    placementEdit: normalizePlacementEdit(runtime.placementEdit),
  };
}

export function replacePlacementEdit(state, placementEdit) {
  return replaceRuntime(state, { placementEdit });
}

export function replaceInputRuntime(state, {
  pointerScreenPx = state.runtime.pointer.screenPx,
  activeGesture = state.runtime.activeGesture,
  inputOverride = state.runtime.inputOverride,
} = {}) {
  return replaceRuntime(state, {
    pointer: {
      screenPx: pointerScreenPx,
    },
    activeGesture,
    inputOverride,
  });
}

function replaceRuntime(state, runtime) {
  return {
    ...state,
    runtime: normalizeRuntime({
      ...state.runtime,
      ...runtime,
    }),
  };
}

function normalizeActiveGesture(activeGesture) {
  if (!activeGesture || typeof activeGesture !== "object") {
    return null;
  }
  if (!Object.values(MACHINE_POINTER_GESTURE_KIND).includes(activeGesture.kind)) {
    return null;
  }
  return {
    kind: activeGesture.kind,
  };
}

function normalizeInputOverride(inputOverride) {
  return inputOverride === MACHINE_INPUT_OVERRIDE.PASS_THROUGH ? inputOverride : null;
}

function normalizePlacementEdit(edit) {
  if (!edit || typeof edit !== "object" || !edit.beforeRegistration) {
    return null;
  }
  if (!Object.values(MACHINE_PLACEMENT_EDIT_KIND).includes(edit?.kind)) {
    return null;
  }
  const beforePlacement = normalizePlacement(edit.beforePlacement);
  const previewPlacement = normalizePlacement(edit.previewPlacement);
  if (!beforePlacement || !previewPlacement) {
    return null;
  }
  return {
    kind: edit.kind,
    beforePlacement,
    beforeRegistration: normalizeRegistration(edit.beforeRegistration),
    previewPlacement,
  };
}

function normalizePoint(point) {
  if (!Number.isFinite(point?.x) || !Number.isFinite(point?.y)) {
    return null;
  }
  return { x: point.x, y: point.y };
}
