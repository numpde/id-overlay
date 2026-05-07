import {
  replacePlacementEdit,
} from "./state.js";
import {
  normalizePlacement,
} from "../session.js";
import {
  createTransitionResult,
} from "./transition-result.js";
import {
  canEditPlacement,
  normalizePlacementEditKind,
} from "./placement-edit-policy.js";

export function beginPlacementEdit(state, event) {
  if (!canEditPlacement(state)) {
    return createTransitionResult({
      state,
    });
  }
  const kind = normalizePlacementEditKind(event.editKind);
  const renderedPlacement = normalizePlacement(event.renderedPlacement);
  if (!kind || !renderedPlacement) {
    return createTransitionResult({
      state,
    });
  }
  return createTransitionResult({
    state: replacePlacementEdit(state, {
      kind,
      beforePlacement: renderedPlacement,
      beforeRegistration: state.session.registration,
      previewPlacement: renderedPlacement,
    }),
  });
}

export function previewPlacementEdit(state, event) {
  if (!state.runtime.placementEdit) {
    return createTransitionResult({
      state,
    });
  }
  if (!canEditPlacement(state)) {
    return createTransitionResult({
      state: clearPlacementEditRuntime(state),
    });
  }
  const previewPlacement = normalizePlacement(event.placement);
  if (!previewPlacement) {
    return createTransitionResult({
      state,
    });
  }
  return createTransitionResult({
    state: replacePlacementEdit(state, {
      ...state.runtime.placementEdit,
      previewPlacement,
    }),
  });
}

export function clearPlacementEditRuntime(state) {
  return state.runtime.placementEdit ? replacePlacementEdit(state, null) : state;
}
