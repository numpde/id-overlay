import test from "node:test";
import assert from "node:assert/strict";

import {
  MACHINE_EVENT_KIND,
  MACHINE_MODE,
  MACHINE_PANEL_INTENT,
  createInitialMachineState,
  fromPersistedMachineSession,
  toPersistedMachineSession,
  toPersistedMachineSessionSnapshot,
  transitionMachine,
} from "../../src/core/machine/index.js";
import { normalizeSessionImage } from "../../src/core/session.js";

const IMAGE = Object.freeze({
  src: "data:image/png;base64,abc",
  width: 800,
  height: 400,
});
const NORMALIZED_IMAGE = normalizeSessionImage(IMAGE);

const PLACEMENT = Object.freeze({
  type: "similarity",
  a: 1,
  b: 0,
  tx: 10,
  ty: 20,
  scale: 1,
  rotationRad: 0,
});

const REGISTRATION = Object.freeze({
  pins: Object.freeze([
    Object.freeze({
      id: 1,
      imagePx: Object.freeze({ x: 400, y: 200 }),
      mapLatLon: Object.freeze({ lat: -1.23, lon: 36.84 }),
    }),
  ]),
  solvedTransform: Object.freeze({
    type: "similarity",
    a: 0.5,
    b: 0,
    tx: 1,
    ty: 2,
    scale: 0.5,
    rotationRad: 0,
  }),
  dirty: false,
});

test("toPersistedMachineSession saves only durable session fields", () => {
  const state = createNoisyMachineState();

  assert.deepEqual(toPersistedMachineSession(state), {
    mode: MACHINE_MODE.ALIGN,
    opacity: 0.75,
    image: NORMALIZED_IMAGE,
    placement: PLACEMENT,
    registration: REGISTRATION,
  });
});

test("toPersistedMachineSession drops runtime panel status and history", () => {
  const persisted = toPersistedMachineSession(createNoisyMachineState());

  assert.equal(Object.hasOwn(persisted, "runtime"), false);
  assert.equal(Object.hasOwn(persisted, "panel"), false);
  assert.equal(Object.hasOwn(persisted, "status"), false);
  assert.equal(Object.hasOwn(persisted, "history"), false);
});

test("toPersistedMachineSessionSnapshot keys only durable session fields", () => {
  const base = toPersistedMachineSessionSnapshot(createNoisyMachineState());
  const transientOnlyChange = toPersistedMachineSessionSnapshot({
    ...createNoisyMachineState(),
    panel: {
      intent: MACHINE_PANEL_INTENT.PASTE_ARMED,
      requestId: 7,
    },
    status: {
      messageOverride: { message: "different" },
    },
    history: {
      past: [{ kind: "different" }],
      future: [],
    },
  });

  assert.deepEqual(base.session, toPersistedMachineSession(createNoisyMachineState()));
  assert.equal(base.key, transientOnlyChange.key);
});

test("toPersistedMachineSession normalizes invalid mode and opacity before saving", () => {
  const persisted = toPersistedMachineSession({
    session: {
      mode: "invalid",
      opacity: 4,
      image: IMAGE,
      placement: PLACEMENT,
      registration: REGISTRATION,
    },
  });

  assert.equal(persisted.mode, MACHINE_MODE.TRACE);
  assert.equal(persisted.opacity, 1);
});

test("fromPersistedMachineSession restores null as the initial machine state", () => {
  assert.deepEqual(fromPersistedMachineSession(null), createInitialMachineState());
});

test("fromPersistedMachineSession restores an empty object with fresh transient domains", () => {
  const state = fromPersistedMachineSession({});

  assert.deepEqual(state, createInitialMachineState());
  assert.deepEqual(state.runtime, createInitialMachineState().runtime);
  assert.deepEqual(state.panel, createInitialMachineState().panel);
  assert.deepEqual(state.status, createInitialMachineState().status);
  assert.deepEqual(state.history, createInitialMachineState().history);
});

test("fromPersistedMachineSession restores durable session facts", () => {
  const state = fromPersistedMachineSession({
    mode: MACHINE_MODE.ALIGN,
    opacity: 0.75,
    image: IMAGE,
    placement: PLACEMENT,
    registration: REGISTRATION,
  });

  assert.deepEqual(state.session, {
    mode: MACHINE_MODE.ALIGN,
    opacity: 0.75,
    image: NORMALIZED_IMAGE,
    placement: PLACEMENT,
    registration: REGISTRATION,
  });
});

test("fromPersistedMachineSession drops extra persisted keys", () => {
  const state = fromPersistedMachineSession({
    mode: MACHINE_MODE.ALIGN,
    opacity: 0.75,
    image: IMAGE,
    placement: PLACEMENT,
    registration: REGISTRATION,
    runtime: { activeGesture: "move-overlay" },
    panel: { intent: MACHINE_PANEL_INTENT.CLEAR_IMAGE_CONFIRM },
    status: { messageOverride: { message: "stale" } },
    history: { past: [{ kind: "load-image" }], future: [{ kind: "clear-image" }] },
    unexpected: true,
  });

  assert.deepEqual(state.runtime, createInitialMachineState().runtime);
  assert.deepEqual(state.panel, createInitialMachineState().panel);
  assert.deepEqual(state.status, createInitialMachineState().status);
  assert.deepEqual(state.history, createInitialMachineState().history);
  assert.equal(Object.hasOwn(state, "unexpected"), false);
});

test("fromPersistedMachineSession normalizes invalid registration", () => {
  const state = fromPersistedMachineSession({
    mode: MACHINE_MODE.ALIGN,
    opacity: 0.75,
    image: IMAGE,
    placement: PLACEMENT,
    registration: {
      pins: "invalid",
      solvedTransform: undefined,
      dirty: "yes",
    },
  });

  assert.deepEqual(state.session.registration, {
    pins: [],
    solvedTransform: null,
    dirty: false,
  });
});

test("round trip preserves durable session facts only", () => {
  const original = createNoisyMachineState();
  const restored = fromPersistedMachineSession(toPersistedMachineSession(original));

  assert.deepEqual(restored.session, original.session);
  assert.deepEqual(restored.runtime, createInitialMachineState().runtime);
  assert.deepEqual(restored.panel, createInitialMachineState().panel);
  assert.deepEqual(restored.status, createInitialMachineState().status);
  assert.deepEqual(restored.history, createInitialMachineState().history);
});

test("round trip does not preserve undo or redo history", () => {
  let state = transitionMachine(createInitialMachineState(), {
    type: MACHINE_EVENT_KIND.LOAD_IMAGE,
    image: IMAGE,
    placement: PLACEMENT,
  }).state;
  state = transitionMachine(state, { type: MACHINE_EVENT_KIND.UNDO }).state;

  assert.equal(state.history.future.length, 1);

  const restored = fromPersistedMachineSession(toPersistedMachineSession(state));

  assert.deepEqual(restored.history, {
    past: [],
    future: [],
  });
});

function createNoisyMachineState() {
  return createInitialMachineState({
    session: {
      mode: MACHINE_MODE.ALIGN,
      opacity: 0.75,
      image: IMAGE,
      placement: PLACEMENT,
      registration: REGISTRATION,
    },
    runtime: {
      pointer: {
        screenPx: { x: 1, y: 2 },
      },
      activeGesture: "move-overlay",
      inputOverride: "pass-through",
      placementEdit: {
        kind: "move",
        beforePlacement: PLACEMENT,
        beforeRegistration: REGISTRATION,
        previewPlacement: PLACEMENT,
      },
    },
    panel: {
      intent: MACHINE_PANEL_INTENT.CLEAR_IMAGE_CONFIRM,
    },
    status: {
      messageOverride: { message: "stale" },
    },
    history: {
      past: [{ kind: "load-image" }],
      future: [{ kind: "clear-image" }],
    },
  });
}
