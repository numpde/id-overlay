import test from "node:test";
import assert from "node:assert/strict";

import {
  createGestureForwardingAdapter,
  createProjectionAdapter,
} from "../../../adapters/page-osm-id/page-adapter.js";

// Unclassified candidate: projection failures are data. The application should
// not receive null guesses or page-adapter exceptions for expected misses.
test("projection adapter reports explicit failure facts", () => {
  const projection = createProjectionAdapter({
    readProjectionContext() {
      return {
        kind: "missing-viewport",
      };
    },
  });

  assert.deepEqual(projection.projectScreenPoint({
    screenPx: {
      x: 320,
      y: 240,
    },
  }), {
    kind: "failed",
    reason: "missing-viewport",
  });
});

// Unclassified candidate: mode policy belongs to application/view facts. The
// gesture adapter forwards only explicit gesture facts it was asked to forward.
test("gesture forwarding adapter is mode-agnostic", async () => {
  const forwarded = [];
  const adapter = createGestureForwardingAdapter({
    async forwardGesture(gestureFact) {
      forwarded.push(gestureFact);
      return {
        kind: "forwarded",
      };
    },
  });
  const gesture = {
    kind: "map-pan",
    deltaScreenPx: {
      x: 12,
      y: -8,
    },
  };

  assert.deepEqual(await adapter.forward(gesture), {
    kind: "forwarded",
  });
  assert.deepEqual(forwarded, [gesture]);
});
