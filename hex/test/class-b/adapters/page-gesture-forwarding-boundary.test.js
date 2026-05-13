import test from "node:test";
import assert from "node:assert/strict";

import {
  createGestureForwardingAdapter,
} from "../../../adapters/page-osm-id/gesture-forwarding-adapter.js";

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

// Class-b, deliberately not class-a: OSM/iD event construction is page-adapter
// mechanics. The stable boundary is that pan forwarding is a bounded session:
// the adapter selects the active map document at start and keeps that
// iframe-local coordinate context for move/up.
test("map pan forwarding keeps one active iframe-local gesture context", () => {
  const dispatched = [];
  const adapter = createGestureForwardingAdapter({
    readActiveMapGestureContext() {
      return {
        frameScreenPx: {
          x: 300,
          y: 40,
        },
        panTarget: "embedded-map-viewport",
        continuationTarget: "embedded-map-document",
      };
    },
    dispatchForwardedPointer(event) {
      dispatched.push(event);
    },
  });

  const pan = adapter.beginMapPan({
    screenPx: {
      x: 800,
      y: 240,
    },
  });
  pan.move({
    screenPx: {
      x: 820,
      y: 260,
    },
  });
  pan.finish({
    screenPx: {
      x: 820,
      y: 260,
    },
  });

  assert.deepEqual(dispatched, [
    {
      phase: "start",
      target: "embedded-map-viewport",
      clientPx: {
        x: 500,
        y: 200,
      },
      forwarded: true,
    },
    {
      phase: "move",
      target: "embedded-map-document",
      clientPx: {
        x: 520,
        y: 220,
      },
      forwarded: true,
    },
    {
      phase: "end",
      target: "embedded-map-document",
      clientPx: {
        x: 520,
        y: 220,
      },
      forwarded: true,
    },
  ]);
});

// Class-b: forwarded map pan must target the map viewport even when the screen
// point is visually covered by extension-owned overlay DOM. Otherwise native
// map panning depends on overlay hit-testing accidents.
test("map pan forwarding skips extension-owned overlay hit testing", () => {
  const dispatched = [];
  const adapter = createGestureForwardingAdapter({
    readActiveMapGestureContext() {
      return {
        frameScreenPx: {
          x: 0,
          y: 0,
        },
        panTarget: "map-viewport",
        hitTestStack: ["overlay-image", "map-feature", "map-viewport"],
        extensionOwnedTargets: ["overlay-image"],
      };
    },
    dispatchForwardedPointer(event) {
      dispatched.push(event);
    },
  });

  const pan = adapter.beginMapPan({
    screenPx: {
      x: 200,
      y: 180,
    },
  });

  assert.notEqual(pan, null);
  assert.deepEqual(dispatched, [{
    phase: "start",
    target: "map-viewport",
    clientPx: {
      x: 200,
      y: 180,
    },
    forwarded: true,
  }]);
});

// Class-b: map zoom forwarding is not a bubbling fallback. The adapter
// hit-tests below extension-owned overlay elements, translates the point into
// the active map document, and dispatches one flagged wheel event.
test("map zoom forwarding skips overlay elements and preserves wheel deltas", () => {
  const dispatched = [];
  const adapter = createGestureForwardingAdapter({
    readActiveMapGestureContext() {
      return {
        frameScreenPx: {
          x: 300,
          y: 40,
        },
        hitTestStack: ["overlay-image", "embedded-map-viewport"],
        extensionOwnedTargets: ["overlay-image"],
      };
    },
    dispatchForwardedWheel(event) {
      dispatched.push(event);
    },
  });

  assert.equal(adapter.forwardMapZoom({
    screenPx: {
      x: 800,
      y: 240,
    },
    deltaY: -100,
  }), true);
  assert.deepEqual(dispatched, [{
    target: "embedded-map-viewport",
    clientPx: {
      x: 500,
      y: 200,
    },
    deltaY: -100,
    forwarded: true,
  }]);
});
