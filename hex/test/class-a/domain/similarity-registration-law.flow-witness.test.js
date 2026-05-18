import test from "node:test";
import assert from "node:assert/strict";

import {
  fitSimilarityRegistration,
  SIMILARITY_REGISTRATION_DEFAULT_RESIDUAL_IMAGE_PX_TOLERANCE,
} from "../../../domain/similarity-registration.js";
import {
  createFlowTrace,
  flowEdge,
} from "../../support/flow-trace.js";

// Class-a: similarity registration is pure domain math. It fits one
// translate/rotate/uniform-scale transform from paired points and reports each
// point's residual so callers can distinguish coherent pins from outliers
// without giving arbitrary authority to the first two pins.
test("similarity registration fits translation rotation and scale", () => {
  const trace = createTrace("similarity registration fits translation rotation and scale");

  const fit = fitSimilarityRegistration({
    pairs: [
      pair({ id: 1, source: { x: 0, y: 0 }, target: { x: 10, y: 20 } }),
      pair({ id: 2, source: { x: 10, y: 0 }, target: { x: 10, y: 40 } }),
      pair({ id: 3, source: { x: 0, y: 10 }, target: { x: -10, y: 20 } }),
    ],
  });

  assert.equal(fit.kind, "fit");
  assertNearlyEqual(fit.transform.a, 0);
  assertNearlyEqual(fit.transform.b, 2);
  assertNearlyEqual(fit.transform.tx, 10);
  assertNearlyEqual(fit.transform.ty, 20);
  assertNearlyEqual(fit.transform.scale, 2);
  assertNearlyEqual(fit.transform.rotationRad, Math.PI / 2);
  assert.deepEqual(fit.coherentIds, [1, 2, 3]);
  assert.deepEqual(fit.incoherentIds, []);
  assert.equal(fit.isCoherent, true);
  assert.equal(fit.residuals.every((residual) => residual.coherent), true);
  traceDomainResult(trace, "exact-fit");
});

// Class-a: the closed-form fit should not be tuned only to axis-aligned
// examples. It must recover ordinary similarity transforms across rotations,
// scales, and translations that are plausible for a pasted map screenshot.
test("similarity registration recovers generated similarity transforms", () => {
  const trace = createTrace("similarity registration recovers generated similarity transforms");
  const sourcePoints = [
    { x: 0, y: 0 },
    { x: 640, y: 0 },
    { x: 640, y: 480 },
    { x: 0, y: 480 },
    { x: 310, y: 190 },
  ];
  const transforms = [
    transform({ scale: 0.25, rotationRad: -Math.PI / 2, tx: 3, ty: 250 }),
    transform({ scale: 0.75, rotationRad: -0.3, tx: -80, ty: 40 }),
    transform({ scale: 1, rotationRad: 0, tx: 0, ty: 0 }),
    transform({ scale: 2.5, rotationRad: 0.9, tx: 1200, ty: -900 }),
    transform({ scale: 5, rotationRad: Math.PI - 0.1, tx: -20, ty: 80 }),
  ];

  for (const expectedTransform of transforms) {
    const fit = fitSimilarityRegistration({
      pairs: sourcePoints.map((source, index) => pair({
        id: index + 1,
        source,
        target: applyTransform(source, expectedTransform),
      })),
    });

    assert.equal(fit.kind, "fit");
    assertNearlyEqual(fit.transform.a, expectedTransform.a);
    assertNearlyEqual(fit.transform.b, expectedTransform.b);
    assertNearlyEqual(fit.transform.tx, expectedTransform.tx);
    assertNearlyEqual(fit.transform.ty, expectedTransform.ty);
    assert.deepEqual(fit.coherentIds, [1, 2, 3, 4, 5]);
    assertNearlyEqual(fit.maxResidualImagePx, 0);
  }
  traceDomainResult(trace, "generated-transforms");
});

// Class-a: the fit uses all points and exposes residuals in source-pixel units.
// Small measurement error should not make the transform incoherent, and the
// residual field is the stable evidence future UI can summarize.
test("similarity registration reports bounded residuals for noisy coherent pins", () => {
  const trace = createTrace("similarity registration reports bounded residuals for noisy coherent pins");

  const fit = fitSimilarityRegistration({
    residualImagePxTolerance: 4,
    pairs: [
      pair({ id: 1, source: { x: 0, y: 0 }, target: { x: 10, y: 20 } }),
      pair({ id: 2, source: { x: 10, y: 0 }, target: { x: 10, y: 40 } }),
      pair({ id: 3, source: { x: 0, y: 10 }, target: { x: -9, y: 20 } }),
      pair({ id: 4, source: { x: 10, y: 10 }, target: { x: -10, y: 41 } }),
    ],
  });

  assert.equal(fit.kind, "fit");
  assert.deepEqual(fit.coherentIds, [1, 2, 3, 4]);
  assert.deepEqual(fit.incoherentIds, []);
  assert.equal(fit.maxResidualImagePx < 4, true);
  assert.equal(fit.residuals.every((residual) => Number.isFinite(residual.imagePx)), true);
  traceDomainResult(trace, "bounded-noise");
});

// Class-a: the default residual threshold is product-tuned for manual pinning.
// It accepts ordinary click jitter on a resized screenshot, but it should not
// normalize a visibly warped 30+ source-pixel disagreement as coherent.
test("similarity registration default tolerance separates click noise from visible warp", () => {
  const trace = createTrace("similarity registration default tolerance separates click noise from visible warp");
  const baseTransform = transform({ scale: 1.4, rotationRad: 0.2, tx: 100, ty: -40 });
  const coherentSources = [
    { x: 40, y: 60 },
    { x: 600, y: 75 },
    { x: 580, y: 420 },
    { x: 55, y: 430 },
    { x: 320, y: 240 },
  ];

  const noisyFit = fitSimilarityRegistration({
    pairs: coherentSources.map((source, index) => pair({
      id: index + 1,
      source,
      target: addPoint(
        applyTransform(source, baseTransform),
        deterministicNoise(index, 8),
      ),
    })),
  });
  assert.equal(noisyFit.kind, "fit");
  assert.deepEqual(noisyFit.coherentIds, [1, 2, 3, 4, 5]);
  assert.equal(
    noisyFit.maxResidualImagePx < SIMILARITY_REGISTRATION_DEFAULT_RESIDUAL_IMAGE_PX_TOLERANCE,
    true,
  );

  const warpedFit = fitSimilarityRegistration({
    pairs: [
      ...coherentSources.slice(0, 4).map((source, index) => pair({
        id: index + 1,
        source,
        target: applyTransform(source, baseTransform),
      })),
      pair({
        id: 5,
        source: coherentSources[4],
        target: addPoint(applyTransform(coherentSources[4], baseTransform), {
          x: baseTransform.scale * 36,
          y: 0,
        }),
      }),
    ],
  });
  assert.equal(warpedFit.kind, "fit");
  assert.deepEqual(warpedFit.coherentIds, [1, 2, 3, 4]);
  assert.deepEqual(warpedFit.incoherentIds, [5]);
  assert.equal(
    warpedFit.residuals.find((residual) => residual.id === 5).imagePx
      > SIMILARITY_REGISTRATION_DEFAULT_RESIDUAL_IMAGE_PX_TOLERANCE,
    true,
  );
  traceDomainResult(trace, "default-threshold");
});

// Class-a: outlier classification is consensus-based. A bad pin must not drag
// the fitted transform away from the coherent majority, and the result must name
// the incoherent pin instead of marking the entire set uniformly bad.
test("similarity registration identifies incoherent outlier pins", () => {
  const trace = createTrace("similarity registration identifies incoherent outlier pins");

  const fit = fitSimilarityRegistration({
    residualImagePxTolerance: 5,
    pairs: [
      pair({ id: 1, source: { x: 0, y: 0 }, target: { x: 10, y: 20 } }),
      pair({ id: 2, source: { x: 100, y: 0 }, target: { x: 10, y: 220 } }),
      pair({ id: 3, source: { x: 0, y: 100 }, target: { x: -190, y: 20 } }),
      pair({ id: 4, source: { x: 100, y: 100 }, target: { x: 500, y: 500 } }),
    ],
  });

  assert.equal(fit.kind, "fit");
  assertNearlyEqual(fit.transform.a, 0);
  assertNearlyEqual(fit.transform.b, 2);
  assertNearlyEqual(fit.transform.tx, 10);
  assertNearlyEqual(fit.transform.ty, 20);
  assert.deepEqual(fit.transform.pairIds, [1, 2, 3]);
  assert.deepEqual(fit.coherentIds, [1, 2, 3]);
  assert.deepEqual(fit.incoherentIds, [4]);
  assert.deepEqual(fit.residuals.map((residual) => residual.id), [1, 2, 3, 4]);
  assert.equal(fit.isCoherent, false);
  assert.equal(fit.residuals.find((residual) => residual.id === 4).coherent, false);
  traceDomainResult(trace, "outlier");
});

// Class-a: consensus must emerge from the point set, not from array order. A
// bad early pin should be isolated when later pins agree on one similarity.
test("similarity registration does not privilege early outlier pins", () => {
  const trace = createTrace("similarity registration does not privilege early outlier pins");

  const fit = fitSimilarityRegistration({
    residualImagePxTolerance: 5,
    pairs: [
      pair({ id: 1, source: { x: 100, y: 100 }, target: { x: 500, y: 500 } }),
      pair({ id: 2, source: { x: 0, y: 0 }, target: { x: 10, y: 20 } }),
      pair({ id: 3, source: { x: 100, y: 0 }, target: { x: 10, y: 220 } }),
      pair({ id: 4, source: { x: 0, y: 100 }, target: { x: -190, y: 20 } }),
    ],
  });

  assert.equal(fit.kind, "fit");
  assert.deepEqual(fit.transform.pairIds, [2, 3, 4]);
  assert.deepEqual(fit.coherentIds, [2, 3, 4]);
  assert.deepEqual(fit.incoherentIds, [1]);
  assertNearlyEqual(fit.transform.a, 0);
  assertNearlyEqual(fit.transform.b, 2);
  assertNearlyEqual(fit.transform.tx, 10);
  assertNearlyEqual(fit.transform.ty, 20);
  traceDomainResult(trace, "order-independent-outlier");
});

// Class-a: a transform that would require non-uniform scale or reflection is
// not a similarity. The solver may find the largest coherent subset, but it must
// expose the residual evidence instead of pretending all pins fit.
test("similarity registration reports warp-like geometry as incoherent residuals", () => {
  const trace = createTrace("similarity registration reports warp-like geometry as incoherent residuals");

  const anisotropicFit = fitSimilarityRegistration({
    residualImagePxTolerance: 10,
    pairs: [
      pair({ id: 1, source: { x: 0, y: 0 }, target: { x: 0, y: 0 } }),
      pair({ id: 2, source: { x: 100, y: 0 }, target: { x: 200, y: 0 } }),
      pair({ id: 3, source: { x: 0, y: 100 }, target: { x: 0, y: 100 } }),
      pair({ id: 4, source: { x: 100, y: 100 }, target: { x: 200, y: 100 } }),
    ],
  });

  assert.equal(anisotropicFit.kind, "fit");
  assert.equal(anisotropicFit.isCoherent, false);
  assert.equal(anisotropicFit.incoherentIds.length > 0, true);
  assert.equal(anisotropicFit.maxResidualImagePx > 10, true);

  const reflectedFit = fitSimilarityRegistration({
    residualImagePxTolerance: 10,
    pairs: [
      pair({ id: 1, source: { x: 0, y: 0 }, target: { x: 0, y: 0 } }),
      pair({ id: 2, source: { x: 100, y: 0 }, target: { x: 100, y: 0 } }),
      pair({ id: 3, source: { x: 0, y: 100 }, target: { x: 0, y: -100 } }),
      pair({ id: 4, source: { x: 100, y: 100 }, target: { x: 100, y: -100 } }),
    ],
  });

  assert.equal(reflectedFit.kind, "fit");
  assert.equal(reflectedFit.isCoherent, false);
  assert.equal(reflectedFit.incoherentIds.length >= 1, true);
  assert.equal(reflectedFit.maxResidualImagePx > 10, true);
  traceDomainResult(trace, "warp-residuals");
});

// Class-a: residuals are reported in source-image pixels so the same pin
// disagreement has the same classification at different map-world scales.
test("similarity registration residual tolerance is image-scale invariant", () => {
  const trace = createTrace("similarity registration residual tolerance is image-scale invariant");
  const outlierResiduals = [];

  for (const scale of [0.05, 0.5, 5]) {
    const baseTransform = transform({ scale, rotationRad: -0.4, tx: 11, ty: 19 });
    const fit = fitSimilarityRegistration({
      residualImagePxTolerance: 12,
      pairs: [
        pair({ id: 1, source: { x: 0, y: 0 }, target: applyTransform({ x: 0, y: 0 }, baseTransform) }),
        pair({ id: 2, source: { x: 200, y: 0 }, target: applyTransform({ x: 200, y: 0 }, baseTransform) }),
        pair({ id: 3, source: { x: 0, y: 200 }, target: applyTransform({ x: 0, y: 200 }, baseTransform) }),
        pair({
          id: 4,
          source: { x: 200, y: 200 },
          target: addPoint(applyTransform({ x: 200, y: 200 }, baseTransform), {
            x: scale * 36,
            y: 0,
          }),
        }),
      ],
    });

    assert.equal(fit.kind, "fit");
    assert.deepEqual(fit.incoherentIds, [4]);
    outlierResiduals.push(fit.residuals.find((residual) => residual.id === 4).imagePx);
  }
  assert.equal(outlierResiduals.every((residual) => residual > 12), true);
  assertNearlyEqual(outlierResiduals[0], outlierResiduals[1]);
  assertNearlyEqual(outlierResiduals[1], outlierResiduals[2]);
  traceDomainResult(trace, "scale-invariant-residuals");
});

// Class-a: callers need diagnostics they can trust. The solver must not mutate
// pin facts, and residual rows must remain in the original input order even
// when consensus fitting excludes an outlier.
test("similarity registration preserves inputs and residual order", () => {
  const trace = createTrace("similarity registration preserves inputs and residual order");
  const pairs = [
    pair({ id: "a", source: { x: 0, y: 0 }, target: { x: 10, y: 20 } }),
    pair({ id: "b", source: { x: 100, y: 0 }, target: { x: 10, y: 220 } }),
    pair({ id: "c", source: { x: 0, y: 100 }, target: { x: -190, y: 20 } }),
    pair({ id: "d", source: { x: 100, y: 100 }, target: { x: 500, y: 500 } }),
  ];
  const before = JSON.stringify(pairs);

  const fit = fitSimilarityRegistration({
    residualImagePxTolerance: 5,
    pairs,
  });

  assert.equal(JSON.stringify(pairs), before);
  assert.equal(fit.kind, "fit");
  assert.deepEqual(fit.transform.pairIds, ["a", "b", "c"]);
  assert.deepEqual(fit.residuals.map((residual) => residual.id), ["a", "b", "c", "d"]);
  traceDomainResult(trace, "input-stability");
});

// Class-a: impossible geometry should fail explicitly instead of producing
// numeric garbage. A similarity transform cannot be inferred from fewer than
// two points or from coincident source points.
test("similarity registration reports explicit non-fit failures", () => {
  const trace = createTrace("similarity registration reports explicit non-fit failures");

  assert.deepEqual(fitSimilarityRegistration({
    pairs: [pair({ id: 1 })],
  }), {
    kind: "failed",
    reason: "insufficient-pairs",
  });

  assert.deepEqual(fitSimilarityRegistration({
    pairs: [
      pair({ id: 1, source: { x: 4, y: 4 }, target: { x: 0, y: 0 } }),
      pair({ id: 2, source: { x: 4, y: 4 }, target: { x: 1, y: 1 } }),
    ],
  }), {
    kind: "failed",
    reason: "degenerate-source",
    pairIds: [1, 2],
  });

  assert.deepEqual(fitSimilarityRegistration({
    residualImagePxTolerance: 0,
    pairs: [
      pair({ id: 1, source: { x: 0, y: 0 }, target: { x: 0, y: 0 } }),
      pair({ id: 2, source: { x: 1, y: 0 }, target: { x: 1, y: 0 } }),
    ],
  }), {
    kind: "failed",
    reason: "invalid-tolerance",
  });

  assert.deepEqual(fitSimilarityRegistration({
    pairs: [
      pair({ id: 1, source: { x: 0, y: 0 }, target: { x: 0, y: 0 } }),
      pair({ id: 2, source: { x: 1, y: 0 }, target: { x: NaN, y: 0 } }),
    ],
  }), {
    kind: "failed",
    reason: "invalid-pair",
    pairIds: [2],
  });

  assert.deepEqual(fitSimilarityRegistration({
    pairs: [
      pair({ id: 1, source: { x: 0, y: 0 }, target: { x: 4, y: 4 } }),
      pair({ id: 2, source: { x: 1, y: 0 }, target: { x: 4, y: 4 } }),
    ],
  }), {
    kind: "failed",
    reason: "degenerate-target",
    pairIds: [1, 2],
  });
  traceDomainResult(trace, "non-fit");
});

function createTrace(testName) {
  return createFlowTrace({
    file: import.meta.url,
    test: testName,
  });
}

function traceDomainResult(trace, phase) {
  trace.edge(flowEdge("check.similarity-registration", "sink.domain-law", {
    phase,
    terminal: "domain-result",
  }));
}

function pair({
  id,
  source = {
    x: 0,
    y: 0,
  },
  target = {
    x: 0,
    y: 0,
  },
}) {
  return {
    id,
    source,
    target,
  };
}

function transform({ scale, rotationRad, tx, ty }) {
  return {
    a: scale * Math.cos(rotationRad),
    b: scale * Math.sin(rotationRad),
    scale,
    rotationRad,
    tx,
    ty,
  };
}

function applyTransform(point, fittedTransform) {
  return {
    x: point.x * fittedTransform.a - point.y * fittedTransform.b + fittedTransform.tx,
    y: point.x * fittedTransform.b + point.y * fittedTransform.a + fittedTransform.ty,
  };
}

function addPoint(left, right) {
  return {
    x: left.x + right.x,
    y: left.y + right.y,
  };
}

function deterministicNoise(index, magnitude) {
  const angle = (index + 1) * 1.7;
  return {
    x: Math.cos(angle) * magnitude,
    y: Math.sin(angle) * magnitude,
  };
}

function assertNearlyEqual(actual, expected, epsilon = 1e-9) {
  assert.equal(Math.abs(actual - expected) <= epsilon, true, `${actual} ~= ${expected}`);
}
