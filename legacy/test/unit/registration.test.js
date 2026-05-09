import test from "node:test";
import assert from "node:assert/strict";

import {
  canSolveRegistration,
  createInvalidatedRegistration,
  createPlacementEditedRegistration,
  didRegistrationChange,
  getRegistrationPinCount,
  hasCleanSolvedTransform,
  needsSolveRecompute,
  resolveRegistrationPinMutation,
  resolveRegistrationSolveState,
} from "../../src/core/registration.js";
import {
  createEmptyRegistration,
  normalizeRegistration,
} from "../../src/core/session.js";

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
