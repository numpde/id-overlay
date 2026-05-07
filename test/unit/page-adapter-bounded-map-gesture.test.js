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
    runBoundary(operation, fn, fallbackValue) {
      calls.push({ operation, fallbackValue });
      return fn();
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
  assert.deepEqual(calls.map((call) => call.operation), [
    "begin-map-pan",
    "update-map-pan",
    "end-map-pan",
    "forward-map-zoom",
  ]);
  assert.deepEqual(calls.map((call) => call.fallbackValue), [
    false,
    false,
    undefined,
    false,
  ]);
});

test("bounded map gesture port centralizes failed gesture fallback values", () => {
  const mapGesture = createBoundedMapGesturePort({
    gestureForwarder: createGestureForwarderStub(),
    runBoundary(_operation, _fn, fallbackValue) {
      return fallbackValue;
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
