import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_SESSION_OPACITY,
  SESSION_MODE,
  canSolveRegistration,
  createEmptyRegistration,
  createEmptySession,
  createInvalidatedRegistration,
  createPlacementEditedRegistration,
  didRegistrationChange,
  getOverlayImage,
  getRegistrationPinCount,
  hasCleanSolvedTransform,
  hasOverlayImageSession,
  isAlignMode,
  isTraceMode,
  needsSolveRecompute,
  normalizeRegistration,
  normalizeSession,
  normalizeSessionImage,
  normalizeSessionMode,
  normalizeSessionOpacity,
  placementsEqual,
  resolveRegistrationPinMutation,
  resolveRegistrationSolveState,
} from "../../src/core/session.js";

const IMAGE = Object.freeze({
  src: "data:image/png;base64,abc",
  width: 800,
  height: 400,
});

const PLACEMENT = Object.freeze({
  type: "similarity",
  a: 1,
  b: 0,
  tx: 10,
  ty: 20,
  scale: 1,
  rotationRad: 0,
});

const PIN_1 = Object.freeze({
  id: 1,
  imagePx: Object.freeze({ x: 400, y: 200 }),
  mapLatLon: Object.freeze({ lat: -1.23, lon: 36.84 }),
});

const PIN_2 = Object.freeze({
  id: 2,
  imagePx: Object.freeze({ x: 600, y: 200 }),
  mapLatLon: Object.freeze({ lat: -1.23, lon: 37.84 }),
});

test("session mode vocabulary and defaults are canonical", () => {
  assert.equal(normalizeSessionMode(SESSION_MODE.ALIGN), SESSION_MODE.ALIGN);
  assert.equal(normalizeSessionMode(SESSION_MODE.TRACE), SESSION_MODE.TRACE);
  assert.equal(normalizeSessionMode("invalid"), SESSION_MODE.TRACE);
  assert.equal(isAlignMode(SESSION_MODE.ALIGN), true);
  assert.equal(isAlignMode(SESSION_MODE.TRACE), false);
  assert.equal(isTraceMode(SESSION_MODE.TRACE), true);
  assert.equal(isTraceMode(SESSION_MODE.ALIGN), false);
});

test("createEmptySession returns the native Trace session", () => {
  assert.deepEqual(createEmptySession(), {
    mode: SESSION_MODE.TRACE,
    opacity: DEFAULT_SESSION_OPACITY,
    image: null,
    placement: null,
    registration: createEmptyRegistration(),
  });
});

test("normalizeSession owns persisted durable-session normalization", () => {
  assert.deepEqual(normalizeSession({
    mode: "invalid",
    opacity: 4,
    image: IMAGE,
    placement: PLACEMENT,
    registration: {
      pins: [
        { id: "2", imagePx: { x: "600", y: "200" }, mapLatLon: { lat: "-1.23", lon: "37.84" } },
        { id: 0, imagePx: { x: 1, y: 2 }, mapLatLon: { lat: 3, lon: 4 } },
        PIN_1,
      ],
      solvedTransform: PLACEMENT,
      dirty: true,
    },
  }), {
    mode: SESSION_MODE.TRACE,
    opacity: 1,
    image: normalizeSessionImage(IMAGE),
    placement: PLACEMENT,
    registration: {
      pins: [PIN_1, PIN_2],
      solvedTransform: PLACEMENT,
      dirty: true,
    },
  });
});

test("session image accessors use normalized image metadata", () => {
  const session = createEmptySession({ image: IMAGE });

  assert.equal(hasOverlayImageSession(createEmptySession()), false);
  assert.equal(getOverlayImage(createEmptySession()), null);
  assert.equal(hasOverlayImageSession(session), true);
  assert.deepEqual(getOverlayImage(session), normalizeSessionImage(IMAGE));
});

test("opacity normalization clamps numeric input and defaults invalid input", () => {
  assert.equal(normalizeSessionOpacity(-1), 0);
  assert.equal(normalizeSessionOpacity(2), 1);
  assert.equal(normalizeSessionOpacity("0.5"), 0.5);
  assert.equal(normalizeSessionOpacity("not-a-number"), DEFAULT_SESSION_OPACITY);
});

test("registration normalization drops invalid pins and resets dirty empty registrations", () => {
  assert.deepEqual(normalizeRegistration({
    pins: [
      { id: 2, imagePx: { x: 2, y: 2 }, mapLatLon: { lat: 2, lon: 2 } },
      { id: 1, imagePx: { x: 1, y: 1 }, mapLatLon: { lat: 1, lon: 1 } },
      { id: -1, imagePx: { x: 3, y: 3 }, mapLatLon: { lat: 3, lon: 3 } },
    ],
    dirty: true,
  }), {
    pins: [
      { id: 1, imagePx: { x: 1, y: 1 }, mapLatLon: { lat: 1, lon: 1 } },
      { id: 2, imagePx: { x: 2, y: 2 }, mapLatLon: { lat: 2, lon: 2 } },
    ],
    solvedTransform: null,
    dirty: true,
  });

  assert.deepEqual(normalizeRegistration({ dirty: true }), createEmptyRegistration());
});

test("registration mutation helpers expose pure pin diffs", () => {
  const previousRegistration = normalizeRegistration({
    pins: [PIN_1, PIN_2],
  });
  const nextRegistration = normalizeRegistration({
    pins: [
      PIN_2,
      { id: 3, imagePx: { x: 700, y: 250 }, mapLatLon: { lat: -1.1, lon: 38 } },
    ],
  });

  assert.deepEqual(
    resolveRegistrationPinMutation(previousRegistration, nextRegistration),
    {
      addedPin: { id: 3, imagePx: { x: 700, y: 250 }, mapLatLon: { lat: -1.1, lon: 38 } },
      removedPinIds: [1],
    },
  );
  assert.equal(didRegistrationChange(previousRegistration, previousRegistration), false);
  assert.equal(didRegistrationChange(previousRegistration, nextRegistration), true);
});

test("placement equality compares canonical similarity components only", () => {
  assert.equal(placementsEqual(PLACEMENT, { ...PLACEMENT, scale: 99, rotationRad: 12 }), true);
  assert.equal(placementsEqual(PLACEMENT, { ...PLACEMENT, tx: 11 }), false);
  assert.equal(placementsEqual(PLACEMENT, null), false);
});

test("registration solve-state predicates are centralized", () => {
  const empty = createEmptyRegistration();
  const insufficient = normalizeRegistration({ pins: [PIN_1], dirty: true });
  const dirty = normalizeRegistration({ pins: [PIN_1, PIN_2], dirty: true });
  const ready = normalizeRegistration({ pins: [PIN_1, PIN_2] });
  const solved = normalizeRegistration({
    pins: [PIN_1, PIN_2],
    solvedTransform: { ...PLACEMENT, pinCount: 2 },
    dirty: false,
  });

  assert.equal(canSolveRegistration(empty), false);
  assert.equal(canSolveRegistration(insufficient), false);
  assert.equal(canSolveRegistration(dirty), true);
  assert.equal(getRegistrationPinCount(dirty), 2);
  assert.equal(hasCleanSolvedTransform(empty), false);
  assert.equal(hasCleanSolvedTransform(solved), true);
  assert.equal(needsSolveRecompute(empty), false);
  assert.equal(needsSolveRecompute(dirty), true);
  assert.equal(needsSolveRecompute(ready), false);
  assert.equal(needsSolveRecompute(solved), false);
  assert.deepEqual(resolveRegistrationSolveState(empty), { kind: "empty", pinCount: 0, solvedPinCount: 0, canCompute: false });
  assert.deepEqual(resolveRegistrationSolveState(insufficient), { kind: "insufficient-pins", pinCount: 1, solvedPinCount: 1, canCompute: false });
  assert.deepEqual(resolveRegistrationSolveState(dirty), { kind: "dirty", pinCount: 2, solvedPinCount: 2, canCompute: true });
  assert.deepEqual(resolveRegistrationSolveState(ready), { kind: "ready", pinCount: 2, solvedPinCount: 2, canCompute: true });
  assert.deepEqual(resolveRegistrationSolveState(solved), { kind: "solved", pinCount: 2, solvedPinCount: 2, canCompute: true });
});

test("registration edit constructors own solved-transform invalidation semantics", () => {
  const solvedRegistration = normalizeRegistration({
    pins: [PIN_1, PIN_2],
    solvedTransform: PLACEMENT,
    dirty: false,
  });

  assert.deepEqual(createInvalidatedRegistration(solvedRegistration), {
    pins: [PIN_1, PIN_2],
    solvedTransform: null,
    dirty: true,
  });
  assert.deepEqual(createPlacementEditedRegistration(solvedRegistration), {
    pins: [PIN_1, PIN_2],
    solvedTransform: PLACEMENT,
    dirty: true,
  });
});
