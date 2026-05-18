import {
  fitSimilarityRegistration,
  SIMILARITY_REGISTRATION_DEFAULT_RESIDUAL_IMAGE_PX_TOLERANCE,
} from "./similarity-registration.js";

export function solveRegistrationPlacement({ pins }) {
  if (pins.length < 2) {
    return {
      kind: "failed",
      reason: "insufficient-pins",
    };
  }

  const fit = fitSimilarityRegistration({
    residualImagePxTolerance: SIMILARITY_REGISTRATION_DEFAULT_RESIDUAL_IMAGE_PX_TOLERANCE,
    pairs: pins.map((pin) => ({
      id: pin.id,
      source: pin.imagePx,
      target: projectLatLonToWorld(pin.mapLatLon),
    })),
  });
  if (fit.kind === "failed") {
    return failedSolveFromFit(fit);
  }
  if (!hasAuthoritativeConsensus({ fit, pinCount: pins.length })) {
    return {
      kind: "failed",
      reason: "inconsistent-pins",
      pinIds: pins.map((pin) => pin.id),
      residuals: fit.residuals,
    };
  }

  return {
    kind: "solved",
    solvedTransform: solvedTransformFromFit(fit),
    residuals: fit.residuals,
    coherentPinIds: fit.coherentIds,
    incoherentPinIds: fit.incoherentIds,
    isCoherent: fit.isCoherent,
  };
}

function failedSolveFromFit(fit) {
  if (fit.reason === "insufficient-pairs") {
    return {
      kind: "failed",
      reason: "insufficient-pins",
    };
  }
  return {
    kind: "failed",
    reason: fit.reason === "invalid-pair" || fit.reason === "invalid-tolerance"
      ? "invalid-pins"
      : "degenerate-pins",
    ...(fit.pairIds === undefined ? {} : {
      pinIds: fit.pairIds,
    }),
  };
}

function hasAuthoritativeConsensus({ fit, pinCount }) {
  if (fit.isCoherent) {
    return true;
  }
  return pinCount === 2 || fit.coherentIds.length >= 3;
}

function solvedTransformFromFit(fit) {
  return {
    type: "image-to-map-world",
    a: fit.transform.a,
    b: fit.transform.b,
    tx: fit.transform.tx,
    ty: fit.transform.ty,
    scale: fit.transform.scale,
    rotationRad: fit.transform.rotationRad,
    pinIds: fit.transform.pairIds,
  };
}

function projectLatLonToWorld(point) {
  const sinLat = Math.sin((point.lat * Math.PI) / 180);
  const clampedSin = Math.min(0.9999, Math.max(-0.9999, sinLat));
  return {
    x: 256 * ((point.lon + 180) / 360),
    y: 256 * (0.5 - Math.log((1 + clampedSin) / (1 - clampedSin)) / (4 * Math.PI)),
  };
}
