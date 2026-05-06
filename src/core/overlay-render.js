import {
  hasCleanSolvedTransform,
  hasOverlayImageSession,
} from "./session.js";
import { clampOpacity } from "./opacity.js";
import {
  createPlacementScreenTransform,
  createSolvedScreenTransform,
  derivePlacementFromScreenTransform,
} from "./transform.js";

export function resolveOverlayRenderState(state) {
  const { session, runtime } = resolveRenderInputs(state);
  if (!hasOverlayImageSession(session)) {
    return {
      source: "none",
      similarityTransform: null,
    };
  }
  if (runtime?.placementEdit?.previewPlacement) {
    return {
      source: "placement-preview",
      similarityTransform: runtime.placementEdit.previewPlacement,
    };
  }
  if (hasCleanSolvedTransform(session.registration)) {
    return {
      source: "solved",
      similarityTransform: session.registration.solvedTransform,
    };
  }
  return {
    source: "placement",
    similarityTransform: session.placement,
  };
}

export function resolveOverlayScreenTransform({ state, snapshot }) {
  const renderState = resolveOverlayRenderState(state);
  if (!renderState.similarityTransform) {
    return null;
  }

  if (renderState.source === "solved") {
    return createSolvedScreenTransform({
      snapshot,
      solvedTransform: renderState.similarityTransform,
    });
  }

  return createPlacementScreenTransform({
    placement: renderState.similarityTransform,
    snapshot,
  });
}

export function resolveOverlayRenderSource(state) {
  return resolveOverlayRenderState(state).source;
}

export function derivePlacementFromCurrentRenderState({ state, snapshot }) {
  const { session } = resolveRenderInputs(state);
  if (!hasOverlayImageSession(session) || !hasCleanSolvedTransform(session.registration)) {
    return null;
  }
  const transform = resolveOverlayScreenTransform({
    state,
    snapshot,
  });
  return derivePlacementFromScreenTransform({
    snapshot,
    transform,
  });
}

export function buildOverlayRenderModel({ image, transform, opacity }) {
  const scale = Math.hypot(transform.a, transform.b);
  const rotationRad = Math.atan2(transform.b, transform.a);
  return {
    left: transform.tx,
    top: transform.ty,
    width: image.width * scale,
    height: image.height * scale,
    scale,
    rotationRad,
    rotationDeg: (rotationRad * 180) / Math.PI,
    opacity: clampOpacity(opacity),
  };
}

function resolveRenderInputs(state) {
  return {
    session: state?.session ?? state,
    runtime: state?.session ? state.runtime ?? null : null,
  };
}
