import test from "node:test";
import assert from "node:assert/strict";

import {
  beginOverlayPointerSequence,
  clearOverlayPointerSequence,
  createInitialOverlayPointerSequenceState,
  hasPendingOverlayPointerSequence,
  resolveOverlayPointerSequenceActivation,
} from "../../src/core/overlay-pointer-sequence.js";

test("overlay pointer sequence has a single initial idle state", () => {
  const initial = createInitialOverlayPointerSequenceState();
  assert.equal(hasPendingOverlayPointerSequence(initial), false);
  assert.equal(initial.kind, "idle");
});

test("overlay pointer sequence starts pending and activates after the drag threshold", () => {
  const pending = beginOverlayPointerSequence({
    button: 0,
    dragMode: "map-pan",
    startScreenPoint: { x: 100, y: 100 },
  });

  assert.equal(hasPendingOverlayPointerSequence(pending), true);

  assert.deepEqual(
    resolveOverlayPointerSequenceActivation({
      state: pending,
      screenPoint: { x: 102, y: 102 },
    }),
    {
      shouldStartDrag: false,
      sequence: pending,
    },
  );

  assert.deepEqual(
    resolveOverlayPointerSequenceActivation({
      state: pending,
      screenPoint: { x: 104, y: 104 },
    }),
    {
      shouldStartDrag: true,
      sequence: pending,
    },
  );
});

test("clearing the overlay pointer sequence returns it to the shared idle state", () => {
  const cleared = clearOverlayPointerSequence();
  assert.equal(hasPendingOverlayPointerSequence(cleared), false);
  assert.equal(cleared, createInitialOverlayPointerSequenceState());
});
