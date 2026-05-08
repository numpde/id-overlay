import test from "node:test";
import assert from "node:assert/strict";

import {
  createBoundedMapGesturePort,
} from "../../src/content/page-adapter/bounded-map-gesture.js";

test("bounded map gesture port delegates gesture methods through named boundary operations", () => {
  const calls = [];
  const event = {};
  const gestureForwarder = createGestureForwarderStub({
    beginMapPan: true,
    updateMapPan: true,
    forwardMapZoom: true,
    isForwardedMapGestureEvent: true,
  });
  const mapGesture = createBoundedMapGesturePort({
    gestureForwarder,
    runBoundary(operation, fn) {
      calls.push(operation);
      return {
        ok: true,
        value: fn(),
      };
    },
  });

  assert.equal(mapGesture.beginMapPan({ x: 1, y: 2 }), true);
  assert.equal(mapGesture.updateMapPan({ x: 3, y: 4 }), true);
  assert.equal(mapGesture.endMapPan({ x: 5, y: 6 }), undefined);
  assert.equal(mapGesture.forwardMapZoom({
    screenPoint: { x: 7, y: 8 },
    deltaY: -1,
  }), true);
  assert.equal(mapGesture.isForwardedMapGestureEvent(event), true);
  assert.deepEqual(calls, [
    "begin-map-pan",
    "update-map-pan",
    "end-map-pan",
    "forward-map-zoom",
  ]);
});

test("bounded map gesture port centralizes failed gesture fallback values", () => {
  const mapGesture = createBoundedMapGesturePort({
    gestureForwarder: createGestureForwarderStub(),
    runBoundary() {
      return { ok: false };
    },
  });

  assert.equal(mapGesture.beginMapPan({ x: 1, y: 2 }), false);
  assert.equal(mapGesture.updateMapPan({ x: 3, y: 4 }), false);
  assert.equal(mapGesture.endMapPan({ x: 5, y: 6 }), undefined);
  assert.equal(mapGesture.forwardMapZoom({
    screenPoint: { x: 7, y: 8 },
  }), false);
});

function createGestureForwarderStub(results = {}) {
  return {
    beginMapPan() {
      return results.beginMapPan;
    },
    updateMapPan() {
      return results.updateMapPan;
    },
    endMapPan() {
      return results.endMapPan;
    },
    forwardMapZoom() {
      return results.forwardMapZoom;
    },
    isForwardedMapGestureEvent() {
      return results.isForwardedMapGestureEvent;
    },
  };
}
