import test from "node:test";
import assert from "node:assert/strict";

import { buildOverlayViewModel } from "../../src/content/overlay/view-model.js";
import { MACHINE_INPUT_OVERRIDE } from "../../src/core/machine/events.js";
import { createInitialMachineState } from "../../src/core/machine/state.js";
import {
  SESSION_MODE,
  createEmptySession,
} from "../../src/core/session.js";
import { createPlacementTransform } from "../../src/core/transform.js";

const TEST_IMAGE = Object.freeze({
  src: "data:image/png;base64,abc",
  width: 800,
  height: 400,
});

const TEST_SNAPSHOT = Object.freeze({
  viewportRect: { left: 100, top: 200, width: 800, height: 400 },
  localViewportRect: { left: 0, top: 0, width: 800, height: 400 },
  mapView: { center: { lat: 0, lon: 0 }, zoom: 16 },
  surfaceMotion: {
    transformCss: "matrix(1, 0, 0, 1, 12, -8)",
    transformOriginCss: "0px 0px",
  },
});

test("overlay view model preserves viewport and surface facts without an image", () => {
  const state = createInitialMachineState();
  const viewModel = buildOverlayViewModel({
    machineState: state,
    runtime: state.runtime,
    snapshot: TEST_SNAPSHOT,
  });

  assert.deepEqual(viewModel.viewport, {
    mode: SESSION_MODE.TRACE,
    isPassThrough: true,
    rect: TEST_SNAPSHOT.localViewportRect,
  });
  assert.deepEqual(viewModel.mapLayer, TEST_SNAPSHOT.surfaceMotion);
  assert.equal(viewModel.image, null);
  assert.equal(viewModel.frame, null);
  assert.deepEqual(viewModel.pins, {
    overlay: [],
    map: [],
  });
});

test("overlay view model exposes render-ready image and frame geometry", () => {
  const viewModel = buildOverlayViewModel({
    machineState: createOverlayMachineState({ mode: SESSION_MODE.ALIGN }),
    runtime: createInitialMachineState().runtime,
    snapshot: TEST_SNAPSHOT,
  });

  assert.deepEqual(viewModel.image, {
    src: TEST_IMAGE.src,
    left: 0,
    top: 0,
    width: 800,
    height: 400,
    opacity: 0.6,
    rotationDeg: 0,
  });
  assert.deepEqual(viewModel.frame, {
    left: 0,
    top: 0,
    width: 800,
    height: 400,
    rotationDeg: 0,
    ownsPointerHitTesting: true,
  });
});

test("overlay view model keeps Trace/native-map presentation out of the renderer", () => {
  const viewModel = buildOverlayViewModel({
    machineState: createOverlayMachineState({
      mode: SESSION_MODE.TRACE,
      registration: createPinnedRegistration(),
    }),
    runtime: createInitialMachineState().runtime,
    snapshot: TEST_SNAPSHOT,
    projectMapPinScreenPoint(point) {
      return {
        x: point.lon,
        y: point.lat,
      };
    },
  });

  assert.equal(viewModel.viewport.mode, SESSION_MODE.TRACE);
  assert.equal(viewModel.viewport.isPassThrough, true);
  assert.equal(viewModel.frame.ownsPointerHitTesting, false);
  assert.deepEqual(viewModel.pins, {
    overlay: [],
    map: [],
  });
});

test("overlay view model separates pass-through from pin visibility", () => {
  const runtime = {
    ...createInitialMachineState().runtime,
    inputOverride: MACHINE_INPUT_OVERRIDE.PASS_THROUGH,
  };
  const viewModel = buildOverlayViewModel({
    machineState: createOverlayMachineState({
      mode: SESSION_MODE.ALIGN,
      registration: createPinnedRegistration(),
    }),
    runtime,
    snapshot: TEST_SNAPSHOT,
    projectMapPinScreenPoint(point) {
      return {
        x: 500 + point.lon,
        y: 400 - point.lat,
      };
    },
  });

  assert.equal(viewModel.viewport.isPassThrough, true);
  assert.equal(viewModel.frame.ownsPointerHitTesting, false);
  assert.deepEqual(viewModel.pins.overlay, [
    { id: 1, left: 10, top: 15 },
    { id: 2, left: 100, top: 50 },
  ]);
  assert.deepEqual(viewModel.pins.map, [
    { id: 1, left: 400, top: 200 },
    { id: 2, left: 401, top: 199 },
  ]);
});

test("overlay view model projects map pins through a narrow callback", () => {
  const projected = [];
  const viewModel = buildOverlayViewModel({
    machineState: createOverlayMachineState({
      mode: SESSION_MODE.ALIGN,
      registration: createPinnedRegistration(),
    }),
    runtime: createInitialMachineState().runtime,
    snapshot: TEST_SNAPSHOT,
    projectMapPinScreenPoint(point) {
      projected.push(point);
      return point.lon === 0
        ? { x: 500, y: 400 }
        : null;
    },
  });

  assert.deepEqual(projected, [
    { lat: 0, lon: 0 },
    { lat: 1, lon: 1 },
  ]);
  assert.deepEqual(viewModel.pins.map, [
    { id: 1, left: 400, top: 200 },
  ]);
});

function createOverlayMachineState({
  mode = SESSION_MODE.ALIGN,
  image = TEST_IMAGE,
  registration = undefined,
} = {}) {
  return createInitialMachineState({
    session: {
      ...createEmptySession({
        mode,
        image,
        opacity: 0.6,
      }),
      placement: image ? createPlacementTransform({
        image,
        centerMapLatLon: TEST_SNAPSHOT.mapView.center,
        scale: 1,
        rotationRad: 0,
        zoom: TEST_SNAPSHOT.mapView.zoom,
      }) : null,
      ...(registration ? { registration } : {}),
    },
  });
}

function createPinnedRegistration() {
  return {
    dirty: true,
    solvedTransform: null,
    pins: [
      {
        id: 1,
        imagePx: { x: 10, y: 15 },
        mapLatLon: { lat: 0, lon: 0 },
      },
      {
        id: 2,
        imagePx: { x: 100, y: 50 },
        mapLatLon: { lat: 1, lon: 1 },
      },
    ],
  };
}
