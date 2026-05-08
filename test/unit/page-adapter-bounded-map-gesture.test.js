import test from "node:test";
import assert from "node:assert/strict";

import {
  createBoundedMapGesturePort,
} from "../../src/content/page-adapter/bounded-map-gesture.js";

test("bounded map gesture port delegates gesture methods through named boundary operations", () => {
  const calls = [];
  const event = {};
  const gestureForwarder = createGestureForwarderStub({
    beginMapPan: createMapPanSessionStub({ move: true }),
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

  const panSession = mapGesture.beginMapPan({ x: 1, y: 2 });
  assert.equal(panSession.move({ x: 3, y: 4 }), true);
  assert.equal(panSession.finish({ x: 5, y: 6 }), undefined);
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

  assert.equal(mapGesture.beginMapPan({ x: 1, y: 2 }), null);
  assert.equal(mapGesture.forwardMapZoom({
    screenPoint: { x: 7, y: 8 },
  }), false);
});

test("bounded map pan sessions centralize failed move and finish fallbacks", () => {
  const mapGesture = createBoundedMapGesturePort({
    gestureForwarder: createGestureForwarderStub({
      beginMapPan: createMapPanSessionStub(),
    }),
    runBoundary(operation, fn) {
      if (operation === "begin-map-pan") {
        return {
          ok: true,
          value: fn(),
        };
      }
      return { ok: false };
    },
  });

  const panSession = mapGesture.beginMapPan({ x: 1, y: 2 });

  assert.equal(panSession.move({ x: 3, y: 4 }), false);
  assert.equal(panSession.finish({ x: 5, y: 6 }), undefined);
});

function createGestureForwarderStub(results = {}) {
  return {
    beginMapPan() {
      return results.beginMapPan;
    },
    forwardMapZoom() {
      return results.forwardMapZoom;
    },
    isForwardedMapGestureEvent() {
      return results.isForwardedMapGestureEvent;
    },
  };
}

function createMapPanSessionStub(results = {}) {
  return {
    move() {
      return results.move;
    },
    finish() {
      return results.finish;
    },
  };
}
