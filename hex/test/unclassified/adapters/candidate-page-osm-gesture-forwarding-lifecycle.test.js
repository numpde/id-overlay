import test from "node:test";
import assert from "node:assert/strict";

import {
  createGestureForwardingAdapter,
} from "../../../adapters/page-osm-id/page-adapter.js";

// Unclassified candidate: legacy map pan forwarding was a bounded session. The
// page adapter selected the active map document on pointer-down and kept that
// iframe-local coordinate context for move/up. The shell should not synthesize
// DOM pointer sequences itself because it does not own frame geometry.
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

// Unclassified candidate: forwarded map pan should target the map viewport even
// when the screen point is visually covered by extension-owned overlay DOM.
// Otherwise native map panning depends on overlay hit-testing accidents.
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

// Unclassified candidate: map zoom forwarding is not a bubbling fallback. The
// adapter should hit-test below extension-owned overlay elements, translate the
// point into the active map document, and dispatch one flagged wheel event.
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
