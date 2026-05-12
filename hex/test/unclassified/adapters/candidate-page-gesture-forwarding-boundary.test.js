import test from "node:test";
import assert from "node:assert/strict";

import {
  createGestureForwardingAdapter,
} from "../../../adapters/page-osm-id/page-adapter.js";

// Unclassified candidate: forwarding is transport, not mode policy. The shell
// decides when a native-map gesture fact should be forwarded; the page adapter
// receives that fact and performs no application-state lookup of its own.
test("gesture forwarding adapter transports explicit native-map gesture facts unchanged", async () => {
  const forwarded = [];
  const adapter = createGestureForwardingAdapter({
    async forwardGesture(gestureFact) {
      forwarded.push(gestureFact);
      return {
        kind: "forwarded-native-map-gesture",
      };
    },
    readApplicationState() {
      assert.fail("gesture forwarding must not inspect product state");
    },
  });
  const gestureFact = {
    kind: "native-map-wheel",
    screenPx: {
      x: 320,
      y: 240,
    },
    delta: {
      x: 0,
      y: -120,
      mode: "pixel",
    },
    modifiers: {
      alt: false,
      ctrl: false,
      meta: false,
      shift: false,
    },
  };

  assert.deepEqual(await adapter.forward(gestureFact), {
    kind: "forwarded-native-map-gesture",
  });
  assert.deepEqual(forwarded, [gestureFact]);
});
