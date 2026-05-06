import test from "node:test";
import assert from "node:assert/strict";

import { planPinToggleAtScreenPoint } from "../../src/content/interactions/pin-toggle-planning.js";
import { createInitialMachineState } from "../../src/core/machine/state.js";
import {
  SESSION_MODE,
  createEmptySession,
} from "../../src/core/session.js";
import {
  createPlacementTransform,
} from "../../src/core/transform.js";
import { IMAGE as TEST_IMAGE } from "../helpers/session-fixtures.js";

const TEST_SNAPSHOT = Object.freeze({
  viewportRect: { left: 100, top: 100, width: 800, height: 400 },
  mapView: { center: { lat: -1.23, lon: 36.84 }, zoom: 16 },
});

test("pin toggle planner projects a screen point into machine-ready pin facts", () => {
  const machineState = createMachineState();

  const plan = planPinToggleAtScreenPoint({
    machineState,
    snapshot: TEST_SNAPSHOT,
    screenPoint: { x: 600, y: 320 },
    screenToMap,
  });

  assert.deepEqual(plan, {
    ok: true,
    pointerScreenPx: { x: 600, y: 320 },
    imagePx: { x: 500, y: 220 },
    mapLatLon: { lat: -1.03, lon: 37.84 },
    existingPinId: null,
    preservedPlacement: null,
  });
});

test("pin toggle planner detects an existing rendered pin", () => {
  const machineState = createMachineState({
    pins: [{
      id: 7,
      imagePx: { x: 500, y: 220 },
      mapLatLon: { lat: -1.03, lon: 37.84 },
    }],
  });

  const plan = planPinToggleAtScreenPoint({
    machineState,
    snapshot: TEST_SNAPSHOT,
    screenPoint: { x: 600, y: 320 },
    screenToMap,
  });

  assert.equal(plan.ok, true);
  assert.equal(plan.existingPinId, 7);
});

test("pin toggle planner preserves solved render placement before pin edits", () => {
  const solvedTransform = {
    type: "similarity",
    a: 2,
    b: 0,
    tx: 10,
    ty: 20,
    scale: 2,
    rotationRad: 0,
    pinCount: 2,
  };
  const machineState = createMachineState({
    registration: {
      dirty: false,
      solvedTransform,
      pins: [{
        id: 1,
        imagePx: { x: 0, y: 0 },
        mapLatLon: { lat: 0, lon: 0 },
      }, {
        id: 2,
        imagePx: { x: 1, y: 0 },
        mapLatLon: { lat: 0, lon: 1 },
      }],
    },
  });

  const plan = planPinToggleAtScreenPoint({
    machineState,
    snapshot: TEST_SNAPSHOT,
    screenPoint: { x: 20, y: 30 },
    screenToMap,
  });

  assert.equal(plan.ok, true);
  assert.deepEqual(plan.preservedPlacement, {
    type: "similarity",
    a: 2,
    b: 0,
    tx: 10,
    ty: 20,
    scale: 2,
    rotationRad: 0,
  });
});

test("pin toggle planner rejects missing or out-of-bounds contexts", () => {
  assert.deepEqual(planPinToggleAtScreenPoint({
    machineState: createInitialMachineState(),
    snapshot: TEST_SNAPSHOT,
    screenPoint: { x: 600, y: 320 },
    screenToMap,
  }), {
    ok: false,
    reason: "no-image",
  });

  assert.deepEqual(planPinToggleAtScreenPoint({
    machineState: createMachineState(),
    snapshot: TEST_SNAPSHOT,
    screenPoint: null,
    screenToMap,
  }), {
    ok: false,
    reason: "no-pointer",
  });

  assert.deepEqual(planPinToggleAtScreenPoint({
    machineState: createMachineState(),
    snapshot: TEST_SNAPSHOT,
    screenPoint: { x: 10, y: 10 },
    screenToMap,
  }), {
    ok: false,
    reason: "pointer-outside-image",
  });
});

function createMachineState({
  pins = [],
  registration = { pins, solvedTransform: null, dirty: false },
} = {}) {
  return createInitialMachineState({
    session: {
      ...createEmptySession({
        mode: SESSION_MODE.ALIGN,
        image: TEST_IMAGE,
      }),
      placement: createPlacementTransform({
        image: TEST_IMAGE,
        centerMapLatLon: TEST_SNAPSHOT.mapView.center,
        scale: 1,
        rotationRad: 0,
        zoom: TEST_SNAPSHOT.mapView.zoom,
      }),
      registration,
    },
  });
}

function screenToMap(point) {
  return {
    lat: -1.23 + (point.y - 300) / 100,
    lon: 36.84 + (point.x - 500) / 100,
  };
}
