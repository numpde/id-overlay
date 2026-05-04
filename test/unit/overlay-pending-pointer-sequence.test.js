import test from "node:test";
import assert from "node:assert/strict";

import { DRAG_MODE } from "../../src/core/interaction-policy.js";
import {
  PENDING_POINTER_SEQUENCE_ADVANCE_KIND,
  createPendingPointerSequenceSession,
} from "../../src/content/overlay/pending-pointer-sequence.js";

test("pending pointer sequence starts, listens globally, and clears", () => {
  let changeCount = 0;
  const session = createPendingPointerSequenceSession({
    onChange() {
      changeCount += 1;
    },
  });

  assert.equal(session.hasPending(), false);
  assert.equal(session.shouldListenGlobally({ hasActiveGesture: false }), false);

  session.begin({
    button: 0,
    dragMode: DRAG_MODE.MAP_PAN,
    startScreenPoint: { x: 100, y: 100 },
  });

  assert.equal(session.hasPending(), true);
  assert.equal(session.shouldListenGlobally({ hasActiveGesture: false }), true);
  assert.equal(changeCount, 1);

  session.clear();

  assert.equal(session.hasPending(), false);
  assert.equal(session.shouldListenGlobally({ hasActiveGesture: true }), true);
  assert.equal(changeCount, 2);
});

test("pending pointer sequence reports below-threshold motion without clearing", () => {
  const session = createPendingPointerSequenceSession();
  session.begin({
    button: 0,
    dragMode: DRAG_MODE.MOVE_OVERLAY,
    startScreenPoint: { x: 100, y: 100 },
  });

  const outcome = session.advance({ x: 102, y: 102 });

  assert.equal(outcome.kind, PENDING_POINTER_SEQUENCE_ADVANCE_KIND.STILL_PENDING);
  assert.deepEqual(outcome.sequence, {
    kind: "pending",
    button: 0,
    dragMode: DRAG_MODE.MOVE_OVERLAY,
    startScreenPoint: { x: 100, y: 100 },
  });
  assert.equal(session.hasPending(), true);
});

test("pending pointer sequence activates once and clears itself", () => {
  let changeCount = 0;
  const session = createPendingPointerSequenceSession({
    onChange() {
      changeCount += 1;
    },
  });
  session.begin({
    button: 0,
    dragMode: DRAG_MODE.MOVE_OVERLAY,
    startScreenPoint: { x: 100, y: 100 },
  });

  const outcome = session.advance({ x: 104, y: 104 });

  assert.equal(outcome.kind, PENDING_POINTER_SEQUENCE_ADVANCE_KIND.ACTIVATED);
  assert.deepEqual(outcome.sequence, {
    kind: "pending",
    button: 0,
    dragMode: DRAG_MODE.MOVE_OVERLAY,
    startScreenPoint: { x: 100, y: 100 },
  });
  assert.equal(session.hasPending(), false);
  assert.equal(changeCount, 2);

  assert.deepEqual(session.advance({ x: 108, y: 108 }), {
    kind: PENDING_POINTER_SEQUENCE_ADVANCE_KIND.NO_PENDING_SEQUENCE,
    sequence: null,
  });
});

test("clearing an idle pending pointer sequence is a no-op", () => {
  let changeCount = 0;
  const session = createPendingPointerSequenceSession({
    onChange() {
      changeCount += 1;
    },
  });

  session.clear();

  assert.equal(changeCount, 0);
});
