import { createPlacementEditedRegistration } from "./session.js";
import { derivePlacementFromCurrentRenderState } from "./transform.js";

export function resolvePlacementEditRenderState({ state, snapshot }) {
  const session = state?.session ?? state;
  const runtime = state?.session ? state.runtime ?? null : null;
  const placement = runtime?.placementEdit?.previewPlacement ??
    derivePlacementFromCurrentRenderState({ state, snapshot }) ??
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
