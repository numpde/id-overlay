import test from "node:test";
import assert from "node:assert/strict";

import {
  canSolveRegistration,
  createDefaultState,
  createStateStore,
  getRegistrationPinCount,
  hasCleanSolvedTransform,
  needsSolveRecompute,
  normalizeState,
  resolveRegistrationSolvePresentation,
  resolveRegistrationSolveState,
} from "../../src/core/state.js";
import { createPlacementTransform } from "../../src/core/transform.js";

test("createDefaultState returns the expected registration defaults", () => {
  assert.deepEqual(createDefaultState(), {
    mode: "trace",
    opacity: 0.6,
    image: null,
    placement: null,
    registration: {
      pins: [],
      solvedTransform: null,
      dirty: false,
    },
  });
});

test("normalizeState clamps opacity, drops invalid image, and discards unsupported legacy fit state", () => {
  const state = normalizeState({
    mode: "align",
    opacity: 99,
    image: { src: "x", width: 0, height: 20 },
    fit: {
      anchorMapLatLon: { lat: -1.23, lon: 36.84 },
      scale: -10,
      rotationRad: "bad",
    },
  });

  assert.equal(state.mode, "align");
  assert.equal(state.opacity, 1);
  assert.equal(state.image, null);
  assert.equal(state.placement, null);
});

test("initial state can restore an existing normalized registration session", () => {
  const placement = createPlacementTransform({
    image: { width: 1200, height: 800 },
    centerMapLatLon: { lat: -1.23, lon: 36.84 },
    scale: 1.5,
    rotationRad: 0.25,
    zoom: 16,
  });
  const store = createStateStore({
    mode: "trace",
    image: {
      src: "data:image/png;base64,abc",
      width: 1200,
      height: 800,
    },
    placement,
    registration: {
      pins: [
        {
          id: 1,
          imagePx: { x: 300, y: 240 },
          mapLatLon: { lat: -1.22, lon: 36.83 },
        },
      ],
      solvedTransform: {
        type: "similarity",
        a: 0.1,
        b: 0.2,
        tx: 10,
        ty: 20,
      },
      dirty: false,
    },
  });

  const state = store.getState();
  assert.equal(state.mode, "trace");
  assert.deepEqual(state.placement, placement);
  assert.equal(state.registration.pins.length, 1);
  assert.equal(state.registration.solvedTransform.type, "similarity");
});

test("loadImageSession sets align mode, centers placement, and clears registration", () => {
  const store = createStateStore({
    registration: {
      pins: [
        {
          id: 1,
          imagePx: { x: 10, y: 20 },
          mapLatLon: { lat: -1.2, lon: 36.8 },
        },
      ],
      solvedTransform: {
        type: "similarity",
        a: 1,
        b: 0,
        tx: 0,
        ty: 0,
      },
      dirty: false,
    },
  });
  const placement = createPlacementTransform({
    image: {
      src: "data:image/png;base64,abc",
      width: 1200,
      height: 800,
    },
    centerMapLatLon: {
      lat: -1.23,
      lon: 36.84,
    },
    scale: 1,
    rotationRad: 0,
    zoom: 16,
  });
  store.loadImageSession({
    src: "data:image/png;base64,abc",
    width: 1200,
    height: 800,
  }, placement);

  const state = store.getState();
  assert.equal(state.mode, "align");
  assert.deepEqual(state.placement, placement);
  assert.deepEqual(state.registration, {
    pins: [],
    solvedTransform: null,
    dirty: false,
  });
});

test("state subscribers can opt out of immediate emission", () => {
  const store = createStateStore();
  let calls = 0;
  store.subscribe(() => {
    calls += 1;
  }, { emitCurrent: false });
  assert.equal(calls, 0);
  store.setMode("align");
  assert.equal(calls, 1);
});

test("adding and removing pins invalidates solved transforms", () => {
  const store = createStateStore();
  const firstPin = store.addPin({
    imagePx: { x: 100, y: 120 },
    mapLatLon: { lat: -1.2, lon: 36.8 },
  });
  assert.equal(firstPin.id, 1);
  assert.equal(store.getState().registration.dirty, true);

  store.setSolvedTransform({
    type: "similarity",
    a: 1,
    b: 0,
    tx: 1,
    ty: 2,
  });
  assert.equal(store.getState().registration.dirty, false);
  assert.ok(store.getState().registration.solvedTransform);

  const secondPin = store.addPin({
    imagePx: { x: 200, y: 220 },
    mapLatLon: { lat: -1.21, lon: 36.81 },
  });
  assert.equal(secondPin.id, 2);
  assert.equal(store.getState().registration.solvedTransform, null);
  assert.equal(store.getState().registration.dirty, true);

  store.removePin(1);
  assert.equal(store.getState().registration.pins.length, 1);
  assert.equal(store.getState().registration.dirty, true);
});

test("clearPins resets the registration session", () => {
  const store = createStateStore({
    registration: {
      pins: [
        {
          id: 1,
          imagePx: { x: 10, y: 20 },
          mapLatLon: { lat: -1.2, lon: 36.8 },
        },
      ],
      solvedTransform: {
        type: "similarity",
        a: 1,
        b: 0,
        tx: 0,
        ty: 0,
      },
      dirty: true,
    },
  });

  store.clearPins();
  assert.deepEqual(store.getState().registration, {
    pins: [],
    solvedTransform: null,
    dirty: false,
  });
});

test("patchPlacement updates only targeted placement fields", () => {
  const store = createStateStore({
    placement: {
      type: "similarity",
      a: 1,
      b: 0,
      tx: 10,
      ty: 20,
    },
  });
  store.patchPlacement({
    tx: 30,
  });

  assert.equal(store.getState().placement.tx, 30);
  assert.equal(store.getState().placement.ty, 20);
});

test("manual placement edits preserve pins but mark an existing solved transform dirty", () => {
  const store = createStateStore({
    placement: {
      type: "similarity",
      a: 0.5,
      b: 0,
      tx: 10,
      ty: 20,
    },
    registration: {
      pins: [
        {
          id: 1,
          imagePx: { x: 10, y: 20 },
          mapLatLon: { lat: -1.2, lon: 36.8 },
        },
        {
          id: 2,
          imagePx: { x: 30, y: 40 },
          mapLatLon: { lat: -1.21, lon: 36.81 },
        },
      ],
      solvedTransform: {
        type: "similarity",
        a: 1,
        b: 0,
        tx: 10,
        ty: 20,
      },
      dirty: false,
    },
  });

  store.patchPlacement({
    a: 0.6,
  });

  assert.equal(store.getState().registration.dirty, true);
  assert.equal(store.getState().registration.solvedTransform?.type, "similarity");
  assert.equal(store.getState().registration.pins.length, 2);
});

test("registration state helpers are the single source of truth for solve readiness", () => {
  const empty = { pins: [], solvedTransform: null, dirty: false };
  const pending = {
    pins: [{ id: 1 }, { id: 2 }],
    solvedTransform: null,
    dirty: true,
  };
  const ready = {
    pins: [{ id: 1 }, { id: 2 }],
    solvedTransform: null,
    dirty: false,
  };
  const solved = {
    pins: [{ id: 1 }, { id: 2 }],
    solvedTransform: { type: "similarity", a: 1, b: 0, tx: 0, ty: 0 },
    dirty: false,
  };

  assert.equal(canSolveRegistration(empty), false);
  assert.equal(canSolveRegistration(pending), true);
  assert.equal(canSolveRegistration(ready), true);
  assert.equal(getRegistrationPinCount(empty), 0);
  assert.equal(getRegistrationPinCount(pending), 2);
  assert.equal(hasCleanSolvedTransform(empty), false);
  assert.equal(hasCleanSolvedTransform(solved), true);
  assert.equal(needsSolveRecompute(empty), false);
  assert.equal(needsSolveRecompute(pending), true);
  assert.equal(needsSolveRecompute(ready), false);
  assert.equal(needsSolveRecompute(solved), false);
  assert.deepEqual(resolveRegistrationSolveState(empty), { kind: "empty", pinCount: 0 });
  assert.deepEqual(resolveRegistrationSolveState(pending), { kind: "dirty", pinCount: 2 });
  assert.deepEqual(resolveRegistrationSolveState(ready), { kind: "ready", pinCount: 2 });
  assert.deepEqual(resolveRegistrationSolveState(solved), { kind: "solved", pinCount: 2 });
  assert.deepEqual(
    resolveRegistrationSolveState({
      pins: [{ id: 1 }],
      solvedTransform: null,
      dirty: true,
    }),
    { kind: "insufficient-pins", pinCount: 1 },
  );
});

test("registration solve presentation is centralized from solve state", () => {
  const empty = { pins: [], solvedTransform: null, dirty: false };
  const insufficient = {
    pins: [{ id: 1 }],
    solvedTransform: null,
    dirty: true,
  };
  const dirty = {
    pins: [{ id: 1 }, { id: 2 }],
    solvedTransform: null,
    dirty: true,
  };
  const ready = {
    pins: [{ id: 1 }, { id: 2 }],
    solvedTransform: null,
    dirty: false,
  };
  const solved = {
    pins: [{ id: 1 }, { id: 2 }],
    solvedTransform: { type: "similarity", a: 1, b: 0, tx: 0, ty: 0, pinCount: 3 },
    dirty: false,
  };

  assert.deepEqual(resolveRegistrationSolvePresentation(empty), {
    kind: "empty",
    pinCount: 0,
    canCompute: false,
    summaryLabel: "No pins yet",
    statusMessage: null,
  });
  assert.deepEqual(resolveRegistrationSolvePresentation(insufficient), {
    kind: "insufficient-pins",
    pinCount: 1,
    canCompute: false,
    summaryLabel: "Collect at least 2 pins",
    statusMessage: null,
  });
  assert.deepEqual(resolveRegistrationSolvePresentation(dirty), {
    kind: "dirty",
    pinCount: 2,
    canCompute: true,
    summaryLabel: "Pins changed; recompute needed",
    statusMessage: "Align mode: pins changed. Compute the transform or switch to Trace to auto-apply it.",
  });
  assert.deepEqual(resolveRegistrationSolvePresentation(ready), {
    kind: "ready",
    pinCount: 2,
    canCompute: true,
    summaryLabel: "Ready to compute",
    statusMessage: null,
  });
  assert.deepEqual(resolveRegistrationSolvePresentation(solved), {
    kind: "solved",
    pinCount: 2,
    canCompute: true,
    summaryLabel: "Solved from 3 pin(s)",
    statusMessage: null,
  });
});
