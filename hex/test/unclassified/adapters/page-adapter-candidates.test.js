import test from "node:test";
import assert from "node:assert/strict";

import {
  createGestureForwardingAdapter,
} from "../../../adapters/page-osm-id/page-adapter.js";

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
