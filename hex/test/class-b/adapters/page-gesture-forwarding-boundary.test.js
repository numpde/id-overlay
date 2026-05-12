import test from "node:test";
import assert from "node:assert/strict";

import {
  createGestureForwardingAdapter,
} from "../../../adapters/page-osm-id/page-adapter.js";

// Class-b, deliberately not class-a: exact OSM/iD event transport is adapter
// mechanics. The stable boundary is that forwarding is transport, not mode
// policy: the shell decides when to forward, and the page adapter receives one
// explicit native-map gesture fact without reading product state.
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
