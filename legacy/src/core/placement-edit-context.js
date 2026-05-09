import {
  createPlacementEditedRegistration,
} from "./registration.js";
import {
  derivePlacementFromCurrentRenderState,
} from "./overlay-render.js";

export function createPlacementEditPlanningContext({ machineState, snapshot }) {
  const editState = resolvePlacementEditRenderState({ machineState, snapshot });
  return editState
    ? {
      editState,
      snapshot,
    }
    : null;
}

export function resolvePlacementEditRenderState({ machineState, snapshot }) {
  const session = machineState?.session ?? machineState;
  const runtime = machineState?.session ? machineState.runtime ?? null : null;
  if (!session) {
    return null;
  }
  const placement = runtime?.placementEdit?.previewPlacement ??
    derivePlacementFromCurrentRenderState({ state: session, snapshot }) ??
    session.placement;
  if (placement?.type !== "similarity") {
    return null;
  }
  return {
    ...session,
    placement,
    registration: createPlacementEditedRegistration(session.registration),
  };
}
