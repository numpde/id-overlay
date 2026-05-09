import test from "node:test";
import assert from "node:assert/strict";

import {
  applyPlacementToPoint,
  composePlacementEdits,
  invertPlacement,
} from "../../../domain/placement.js";

// Unclassified candidate: overlay placement should be reversible pure math.
// This belongs in domain only if placement remains browser-independent geometry.
test("placement transform round-trips through its inverse", () => {
  const point = {
    x: 12.5,
    y: -3.25,
  };
  const placement = {
    x: 42,
    y: -17,
    scale: 1.75,
    rotationRad: Math.PI / 6,
  };

  const transformed = applyPlacementToPoint(point, placement);
  const roundTripped = applyPlacementToPoint(
    transformed,
    invertPlacement(placement),
  );

  assertPointClose(roundTripped, point);
});

// Unclassified candidate: UI edit batching should not create subtle drift.
// Stepwise and batched placement edits should produce the same product fact.
test("placement edit composition is stable across batching", () => {
  const base = {
    x: 0,
    y: 0,
    scale: 1,
    rotationRad: 0,
  };
  const edits = [
    {
      kind: "move",
      deltaPx: {
        x: 80,
        y: 40,
      },
    },
    {
      kind: "rotate",
      deltaRad: Math.PI / 8,
    },
    {
      kind: "scale",
      factor: 1.5,
    },
  ];

  const batched = composePlacementEdits({ base, edits });
  const stepOne = composePlacementEdits({ base, edits: edits.slice(0, 1) });
  const stepwise = composePlacementEdits({
    base: stepOne,
    edits: edits.slice(1),
  });

  assertPlacementClose(stepwise, batched);
});

function assertPointClose(actual, expected) {
  assert.equal(Math.abs(actual.x - expected.x) < 1e-9, true);
  assert.equal(Math.abs(actual.y - expected.y) < 1e-9, true);
}

function assertPlacementClose(actual, expected) {
  assertPointClose(actual, expected);
  assert.equal(Math.abs(actual.scale - expected.scale) < 1e-9, true);
  assert.equal(Math.abs(actual.rotationRad - expected.rotationRad) < 1e-9, true);
}
