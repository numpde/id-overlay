import test from "node:test";
import assert from "node:assert/strict";

import {
  applyAnchoredPlacementEdit,
  applyPlacementToPoint,
  composePlacementEdits,
  invertPlacement,
} from "../../../domain/placement.js";

// Class-a: placement is pure affine geometry. Reversibility is not a product
// preference; without it, every adapter would have to compensate for drift or
// hidden host/runtime facts.
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

// Class-a: semantic edit facts compose deterministically. Gesture batching is
// an adapter concern, so grouping the same facts differently must not change the
// resulting placement value.
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

// Class-a: anchored scale/rotate is the product geometry, not wheel-event
// policy. Keeping the image point fixed in screen space is the invariant that
// lets every adapter express resize/rotate through the same domain operation.
test("anchored placement edits keep the anchor fixed in screen space", () => {
  const base = {
    x: 80,
    y: 40,
    scale: 1,
    rotationRad: 0,
  };
  const imagePx = {
    x: 320,
    y: 240,
  };
  const before = applyPlacementToPoint(imagePx, base);

  for (const edit of [
    {
      kind: "scale",
      factor: 1.2,
      anchorImagePx: imagePx,
    },
    {
      kind: "rotate",
      deltaRad: Math.PI / 8,
      anchorImagePx: imagePx,
    },
  ]) {
    const placement = applyAnchoredPlacementEdit({
      base,
      edit,
    });
    assertPointClose(applyPlacementToPoint(imagePx, placement), before);
  }
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
