import test from "node:test";
import assert from "node:assert/strict";

import {
  solveRegistrationPlacement,
} from "../../../domain/registration.js";
import {
  createFlowTrace,
  flowEdge,
} from "../../support/flow-trace.js";

// Class-a: two-pin registration is a domain law. Pins are durable image/map
// facts, so solving projects map lat/lon into stable map-world coordinates
// instead of consuming screen, viewport, zoom, or DOM facts.
test("registration solve returns explicit success and failure facts", () => {
  const trace = createFlowTrace({
    file: import.meta.url,
    test: "registration solve returns explicit success and failure facts",
  });
  const solved = solveRegistrationPlacement({
    pins: [
      pin({
        id: 1,
        imagePx: {
          x: 0,
          y: 0,
        },
        mapLatLon: {
          lat: 0,
          lon: -180,
        },
      }),
      pin({
        id: 2,
        imagePx: {
          x: 100,
          y: 0,
        },
        mapLatLon: {
          lat: 0,
          lon: -178.59375,
        },
      }),
    ],
  });

  assert.equal(solved.kind, "solved");
  assert.deepEqual(solved.solvedTransform, {
    type: "image-to-map-world",
    a: 0.01,
    b: 0,
    tx: 0,
    ty: 128,
    scale: 0.01,
    rotationRad: 0,
    pinIds: [1, 2],
  });
  assert.deepEqual(solved.coherentPinIds, [1, 2]);
  assert.deepEqual(solved.incoherentPinIds, []);
  assert.equal(solved.isCoherent, true);
  assert.equal(/\b(screen|viewport|zoom|dom)\b/i.test(JSON.stringify(solved)), false);

  assert.deepEqual(solveRegistrationPlacement({
    pins: [],
  }), {
    kind: "failed",
    reason: "insufficient-pins",
  });

  assert.deepEqual(solveRegistrationPlacement({
    pins: [
      pin({
        id: 1,
        imagePx: {
          x: 0,
          y: 0,
        },
      }),
      pin({
        id: 2,
        imagePx: {
          x: 0,
          y: 0,
        },
      }),
    ],
  }), {
    kind: "failed",
    reason: "degenerate-pins",
    pinIds: [1, 2],
  });

  const ambiguousSolve = solveRegistrationPlacement({
    pins: [
      pin({
        id: 1,
        imagePx: {
          x: 0,
          y: 0,
        },
        mapLatLon: {
          lat: 0,
          lon: -180,
        },
      }),
      pin({
        id: 2,
        imagePx: {
          x: 100,
          y: 0,
        },
        mapLatLon: {
          lat: 0,
          lon: -178.59375,
        },
      }),
      pin({
        id: 3,
        imagePx: {
          x: 0,
          y: 100,
        },
        mapLatLon: {
          lat: 0,
          lon: -180,
        },
      }),
    ],
  });
  assert.equal(ambiguousSolve.kind, "failed");
  assert.deepEqual({
    kind: ambiguousSolve.kind,
    reason: ambiguousSolve.reason,
    pinIds: ambiguousSolve.pinIds,
  }, {
    kind: "failed",
    reason: "inconsistent-pins",
    pinIds: [1, 2, 3],
  });
  assert.deepEqual(ambiguousSolve.residuals.map((residual) => residual.id), [1, 2, 3]);

  const outlierSolve = solveRegistrationPlacement({
    pins: [
      pin({
        id: 1,
        imagePx: {
          x: 0,
          y: 0,
        },
        mapLatLon: worldPointLatLon({
          x: 10,
          y: 20,
        }),
      }),
      pin({
        id: 2,
        imagePx: {
          x: 100,
          y: 0,
        },
        mapLatLon: worldPointLatLon({
          x: 10,
          y: 220,
        }),
      }),
      pin({
        id: 3,
        imagePx: {
          x: 0,
          y: 100,
        },
        mapLatLon: worldPointLatLon({
          x: -190,
          y: 20,
        }),
      }),
      pin({
        id: 4,
        imagePx: {
          x: 100,
          y: 100,
        },
        mapLatLon: worldPointLatLon({
          x: 500,
          y: 500,
        }),
      }),
    ],
  });

  assert.equal(outlierSolve.kind, "solved");
  assert.equal(outlierSolve.solvedTransform.type, "image-to-map-world");
  assertNearlyEqual(outlierSolve.solvedTransform.a, 0);
  assertNearlyEqual(outlierSolve.solvedTransform.b, 2);
  assertNearlyEqual(outlierSolve.solvedTransform.tx, 10);
  assertNearlyEqual(outlierSolve.solvedTransform.ty, 20);
  assertNearlyEqual(outlierSolve.solvedTransform.scale, 2);
  assertNearlyEqual(outlierSolve.solvedTransform.rotationRad, Math.PI / 2);
  assert.deepEqual(outlierSolve.solvedTransform.pinIds, [1, 2, 3]);
  assert.deepEqual(outlierSolve.coherentPinIds, [1, 2, 3]);
  assert.deepEqual(outlierSolve.incoherentPinIds, [4]);
  assert.equal(outlierSolve.isCoherent, false);
  assert.deepEqual(outlierSolve.residuals.map((residual) => residual.id), [1, 2, 3, 4]);

  trace.edge(flowEdge("check.registration-solve", "sink.domain-law", {
    terminal: "domain-result",
  }));
});

function pin({
  id,
  imagePx,
  mapLatLon = {
    lat: 0,
    lon: -180,
  },
}) {
  return {
    id,
    imagePx,
    mapLatLon,
  };
}

function worldPointLatLon({ x, y }) {
  const lon = (x / 256) * 360 - 180;
  const mercator = 0.5 - y / 256;
  const latRad = 2 * Math.atan(Math.exp(mercator * 2 * Math.PI)) - Math.PI / 2;
  return {
    lat: (latRad * 180) / Math.PI,
    lon,
  };
}

function assertNearlyEqual(actual, expected, epsilon = 1e-9) {
  assert.equal(Math.abs(actual - expected) <= epsilon, true, `${actual} ~= ${expected}`);
}
