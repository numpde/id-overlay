import test from "node:test";
import assert from "node:assert/strict";

import {
  MACHINE_HISTORY_KIND,
  MACHINE_INPUT_OVERRIDE,
  MACHINE_MODE,
  MACHINE_PANEL_INTENT,
  MACHINE_PLACEMENT_EDIT_KIND,
  MACHINE_POINTER_GESTURE_KIND,
} from "../../src/core/machine/events.js";
import {
  createInitialMachineState,
} from "../../src/core/machine/state.js";
import {
  fromPersistedMachineSession,
  toPersistedMachineSession,
  toPersistedMachineSessionSnapshot,
} from "../../src/core/machine/persistence.js";
import { normalizeSessionImage } from "../../src/core/session.js";

const IMAGE = Object.freeze({
  src: "data:image/png;base64,abc",
  width: 800,
  height: 400,
});
const PASTE_CANCELLED_NOTICE = "paste-cancelled";
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
      notice: {
        requestId: 9,
        kind: PASTE_CANCELLED_NOTICE,
        payload: null,
      },
      lastRequestId: 9,
    },
    history: {
      past: [{ kind: "different" }],
      future: [],
    },
  });

  assert.deepEqual(base.session, toPersistedMachineSession(createNoisyMachineState()));
  assert.equal(base.key, transientOnlyChange.key);
});

test("toPersistedMachineSessionSnapshot key is stable for semantically equal nested data", () => {
  const base = toPersistedMachineSessionSnapshot(createNoisyMachineState());
  const reordered = toPersistedMachineSessionSnapshot({
    session: {
      registration: {
        dirty: false,
        solvedTransform: {
          rotationRad: 0,
          scale: 0.5,
          ty: 2,
          tx: 1,
          b: 0,
          a: 0.5,
          type: "similarity",
        },
        pins: [{
          mapLatLon: { lon: 36.84, lat: -1.23 },
          imagePx: { y: 200, x: 400 },
          id: 1,
        }],
      },
      placement: {
        rotationRad: 0,
        scale: 1,
        ty: 20,
        tx: 10,
        b: 0,
        a: 1,
        type: "similarity",
      },
      image: {
        working: {
          scaleFromOriginal: 1,
          height: 400,
          width: 800,
          src: "data:image/png;base64,abc",
        },
        original: {
          height: 400,
          width: 800,
        },
        height: 400,
        width: 800,
        src: "data:image/png;base64,abc",
      },
      opacity: 0.75,
      mode: MACHINE_MODE.ALIGN,
    },
  });

  assert.equal(base.key, reordered.key);
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
    runtime: { activeGesture: MACHINE_POINTER_GESTURE_KIND.MOVE_OVERLAY },
    panel: { intent: MACHINE_PANEL_INTENT.CLEAR_IMAGE_CONFIRM },
    status: {
      notice: {
        requestId: 9,
        kind: PASTE_CANCELLED_NOTICE,
        payload: null,
      },
      lastRequestId: 9,
    },
    history: {
      past: [{ kind: MACHINE_HISTORY_KIND.LOAD_IMAGE }],
      future: [{ kind: MACHINE_HISTORY_KIND.CLEAR_IMAGE }],
    },
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
  const state = createNoisyMachineState({
    history: {
      past: [{ kind: MACHINE_HISTORY_KIND.LOAD_IMAGE }],
      future: [{ kind: MACHINE_HISTORY_KIND.CLEAR_IMAGE }],
    },
  });

  assert.equal(state.history.past.length, 1);
  assert.equal(state.history.future.length, 1);

  const restored = fromPersistedMachineSession(toPersistedMachineSession(state));

  assert.deepEqual(restored.history, {
    past: [],
    future: [],
  });
});

function createNoisyMachineState(overrides = {}) {
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
      activeGesture: MACHINE_POINTER_GESTURE_KIND.MOVE_OVERLAY,
      inputOverride: MACHINE_INPUT_OVERRIDE.PASS_THROUGH,
      placementEdit: {
        kind: MACHINE_PLACEMENT_EDIT_KIND.MOVE,
        beforePlacement: PLACEMENT,
        beforeRegistration: REGISTRATION,
        previewPlacement: PLACEMENT,
      },
    },
    panel: {
      intent: MACHINE_PANEL_INTENT.CLEAR_IMAGE_CONFIRM,
    },
    status: {
      notice: {
        requestId: 9,
        kind: PASTE_CANCELLED_NOTICE,
        payload: null,
      },
      lastRequestId: 9,
    },
    history: {
      past: [{ kind: "load-image" }],
      future: [{ kind: "clear-image" }],
    },
    ...overrides,
  });
}
