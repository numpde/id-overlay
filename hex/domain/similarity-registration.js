export const SIMILARITY_REGISTRATION_DEFAULT_RESIDUAL_IMAGE_PX_TOLERANCE = 24;
const ROBUST_FIT_ITERATIONS = 8;
const MIN_SCALE = 1e-12;

export function fitSimilarityRegistration({
  pairs,
  residualImagePxTolerance = SIMILARITY_REGISTRATION_DEFAULT_RESIDUAL_IMAGE_PX_TOLERANCE,
} = {}) {
  if (!Array.isArray(pairs) || pairs.length < 2) {
    return {
      kind: "failed",
      reason: "insufficient-pairs",
    };
  }
  if (!Number.isFinite(residualImagePxTolerance) || residualImagePxTolerance <= 0) {
    return {
      kind: "failed",
      reason: "invalid-tolerance",
    };
  }

  const normalizedPairs = pairs.map(normalizePair);
  const invalidPairIds = normalizedPairs
    .filter((pair) => !isFinitePoint(pair.source) || !isFinitePoint(pair.target))
    .map((pair) => pair.id);
  if (invalidPairIds.length > 0) {
    return {
      kind: "failed",
      reason: "invalid-pair",
      pairIds: invalidPairIds,
    };
  }
  const initialFit = fitWeightedSimilarity({
    pairs: normalizedPairs,
    weights: normalizedPairs.map(() => 1),
  });

  let weights = normalizedPairs.map(() => 1);
  let fit = initialFit;
  if (fit.kind === "fit") {
    for (let iteration = 0; iteration < ROBUST_FIT_ITERATIONS; iteration += 1) {
      const residuals = residualsForFit({
        pairs: normalizedPairs,
        transform: fit.transform,
      });
      weights = residuals.map((residual) => robustWeight({
        residualImagePx: residual.imagePx,
        tolerance: residualImagePxTolerance,
      }));
      fit = fitWeightedSimilarity({
        pairs: normalizedPairs,
        weights,
      });
      if (fit.kind === "failed") {
        break;
      }
    }
  }

  const consensus = fitLargestPairConsensus({
    pairs: normalizedPairs,
    residualImagePxTolerance,
    fallbackFit: fit.kind === "fit" ? fit : null,
  });
  if (consensus.kind === "fit") {
    fit = consensus;
  } else {
    return initialFit;
  }

  const residuals = residualsForFit({
    pairs: normalizedPairs,
    transform: fit.transform,
  }).map((residual) => ({
    ...residual,
    coherent: residual.imagePx <= residualImagePxTolerance,
  }));
  const coherentIds = residuals
    .filter((residual) => residual.coherent)
    .map((residual) => residual.id);
  const incoherentIds = residuals
    .filter((residual) => !residual.coherent)
    .map((residual) => residual.id);

  return {
    kind: "fit",
    transform: fit.transform,
    residuals,
    coherentIds,
    incoherentIds,
    isCoherent: incoherentIds.length === 0,
    rmsResidualImagePx: rms(residuals.map((residual) => residual.imagePx)),
    maxResidualImagePx: Math.max(...residuals.map((residual) => residual.imagePx)),
  };
}

function fitLargestPairConsensus({
  pairs,
  residualImagePxTolerance,
  fallbackFit,
}) {
  let best = fallbackFit
    ? scoreCandidateFit({
        pairs,
        fit: fallbackFit,
        residualImagePxTolerance,
      })
    : null;

  for (let leftIndex = 0; leftIndex < pairs.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < pairs.length; rightIndex += 1) {
      const minimalFit = fitWeightedSimilarity({
        pairs: [pairs[leftIndex], pairs[rightIndex]],
        weights: [1, 1],
      });
      if (minimalFit.kind !== "fit") {
        continue;
      }

      const candidate = scoreCandidateFit({
        pairs,
        fit: minimalFit,
        residualImagePxTolerance,
      });
      if (!best || compareCandidateScores(candidate.score, best.score) > 0) {
        best = candidate;
      }
    }
  }

  if (!best || best.score.coherentCount < 2) {
    return {
      kind: "failed",
      reason: "no-consensus",
    };
  }

  let fit = refitConsensus({
    pairs,
    coherentIds: best.coherentIds,
  });
  if (fit.kind !== "fit") {
    return fallbackFit ?? {
      kind: "failed",
      reason: "no-consensus",
    };
  }

  for (let iteration = 0; iteration < pairs.length; iteration += 1) {
    const candidate = scoreCandidateFit({
      pairs,
      fit,
      residualImagePxTolerance,
    });
    const nextFit = refitConsensus({
      pairs,
      coherentIds: candidate.coherentIds,
    });
    if (nextFit.kind !== "fit") {
      return fit;
    }
    if (sameIds(nextFit.transform.pairIds, fit.transform.pairIds)) {
      return nextFit;
    }
    fit = nextFit;
  }

  return fit;
}

function scoreCandidateFit({
  pairs,
  fit,
  residualImagePxTolerance,
}) {
  const residuals = residualsForFit({
    pairs,
    transform: fit.transform,
  });
  const coherentResiduals = residuals.filter((residual) => (
    residual.imagePx <= residualImagePxTolerance
  ));
  return {
    fit,
    coherentIds: coherentResiduals.map((residual) => residual.id),
    score: {
      coherentCount: coherentResiduals.length,
      allCount: pairs.length,
      coherentRmsResidualImagePx: rmsOrInfinity(
        coherentResiduals.map((residual) => residual.imagePx),
      ),
      allRmsResidualImagePx: rms(residuals.map((residual) => residual.imagePx)),
    },
  };
}

function refitConsensus({ pairs, coherentIds }) {
  const coherentIdSet = new Set(coherentIds);
  const coherentPairs = pairs.filter((pair) => coherentIdSet.has(pair.id));
  return fitWeightedSimilarity({
    pairs: coherentPairs,
    weights: coherentPairs.map(() => 1),
  });
}

function compareCandidateScores(left, right) {
  if (left.coherentCount !== right.coherentCount) {
    return left.coherentCount - right.coherentCount;
  }
  if (left.allCount !== right.allCount) {
    return left.allCount - right.allCount;
  }
  if (left.coherentRmsResidualImagePx !== right.coherentRmsResidualImagePx) {
    return right.coherentRmsResidualImagePx - left.coherentRmsResidualImagePx;
  }
  return right.allRmsResidualImagePx - left.allRmsResidualImagePx;
}

function sameIds(left, right) {
  if (left.length !== right.length) {
    return false;
  }
  return left.every((value, index) => value === right[index]);
}

function normalizePair(pair) {
  return {
    id: pair?.id,
    source: {
      x: pair?.source?.x,
      y: pair?.source?.y,
    },
    target: {
      x: pair?.target?.x,
      y: pair?.target?.y,
    },
  };
}

function fitWeightedSimilarity({ pairs, weights }) {
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  if (!Number.isFinite(totalWeight) || totalWeight <= 0) {
    return {
      kind: "failed",
      reason: "degenerate-source",
      pairIds: pairs.map((pair) => pair.id),
    };
  }

  const sourceCentroid = weightedCentroid({
    points: pairs.map((pair) => pair.source),
    weights,
    totalWeight,
  });
  const targetCentroid = weightedCentroid({
    points: pairs.map((pair) => pair.target),
    weights,
    totalWeight,
  });

  let denominator = 0;
  let dot = 0;
  let cross = 0;
  for (let index = 0; index < pairs.length; index += 1) {
    const weight = weights[index];
    const source = subtractPoint(pairs[index].source, sourceCentroid);
    const target = subtractPoint(pairs[index].target, targetCentroid);
    denominator += weight * pointNormSquared(source);
    dot += weight * (target.x * source.x + target.y * source.y);
    cross += weight * (target.y * source.x - target.x * source.y);
  }

  if (!Number.isFinite(denominator) || denominator <= MIN_SCALE) {
    return {
      kind: "failed",
      reason: "degenerate-source",
      pairIds: pairs.map((pair) => pair.id),
    };
  }

  const a = dot / denominator;
  const b = cross / denominator;
  const scale = Math.hypot(a, b);
  if (!Number.isFinite(scale) || scale <= MIN_SCALE) {
    return {
      kind: "failed",
      reason: "degenerate-target",
      pairIds: pairs.map((pair) => pair.id),
    };
  }

  return {
    kind: "fit",
    transform: {
      type: "source-to-target-similarity",
      a,
      b,
      tx: targetCentroid.x - (a * sourceCentroid.x - b * sourceCentroid.y),
      ty: targetCentroid.y - (b * sourceCentroid.x + a * sourceCentroid.y),
      scale,
      rotationRad: Math.atan2(b, a),
      pairIds: pairs.map((pair) => pair.id),
    },
  };
}

function residualsForFit({ pairs, transform }) {
  return pairs.map((pair) => {
    const fittedTarget = applyTransform(pair.source, transform);
    const targetDelta = subtractPoint(pair.target, fittedTarget);
    const targetPx = Math.hypot(targetDelta.x, targetDelta.y);
    return {
      id: pair.id,
      targetDelta,
      targetPx,
      imagePx: targetPx / transform.scale,
    };
  });
}

function robustWeight({ residualImagePx, tolerance }) {
  if (residualImagePx <= tolerance || residualImagePx === 0) {
    return 1;
  }
  return tolerance / residualImagePx;
}

function weightedCentroid({ points, weights, totalWeight }) {
  const total = points.reduce((sum, point, index) => ({
    x: sum.x + point.x * weights[index],
    y: sum.y + point.y * weights[index],
  }), {
    x: 0,
    y: 0,
  });
  return {
    x: total.x / totalWeight,
    y: total.y / totalWeight,
  };
}

function applyTransform(point, transform) {
  return {
    x: point.x * transform.a - point.y * transform.b + transform.tx,
    y: point.x * transform.b + point.y * transform.a + transform.ty,
  };
}

function subtractPoint(left, right) {
  return {
    x: left.x - right.x,
    y: left.y - right.y,
  };
}

function pointNormSquared(point) {
  return point.x * point.x + point.y * point.y;
}

function isFinitePoint(point) {
  return Number.isFinite(point.x) && Number.isFinite(point.y);
}

function rms(values) {
  return Math.sqrt(
    values.reduce((sum, value) => sum + value * value, 0) / values.length,
  );
}

function rmsOrInfinity(values) {
  if (values.length === 0) {
    return Number.POSITIVE_INFINITY;
  }
  return rms(values);
}
