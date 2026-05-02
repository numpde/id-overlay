import test from "node:test";
import assert from "node:assert/strict";

import {
  MACHINE_EFFECT_KIND,
  MACHINE_EVENT_KIND,
  MACHINE_HISTORY_KIND,
  MACHINE_MODE,
  MACHINE_PANEL_INTENT,
  createIdlePanel,
  createInitialMachineState,
  isValidPanelRequestId,
  normalizePanel,
  replacePanel,
  transitionMachine,
} from "../../src/core/machine/index.js";

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

test("initial panel is idle", () => {
  assert.deepEqual(createInitialMachineState().panel, createIdlePanel());
});

test("panel helpers centralize intent normalization and request id validity", () => {
  assert.deepEqual(normalizePanel({
    intent: "invalid",
    requestId: 0,
  }), createIdlePanel());
  assert.deepEqual(normalizePanel({
    intent: MACHINE_PANEL_INTENT.CLEAR_IMAGE_CONFIRM,
    requestId: 3,
  }), {
    intent: MACHINE_PANEL_INTENT.CLEAR_IMAGE_CONFIRM,
    requestId: 3,
  });
  assert.equal(isValidPanelRequestId(null), false);
  assert.equal(isValidPanelRequestId(3), true);
  assert.deepEqual(replacePanel(createInitialMachineState(), {
    intent: MACHINE_PANEL_INTENT.PASTE_ARMED,
    requestId: 4,
  }).panel, {
    intent: MACHINE_PANEL_INTENT.PASTE_ARMED,
    requestId: 4,
  });
});

test("requesting paste arms intent and emits read-paste plus timeout effects", () => {
  const result = transitionMachine(createInitialMachineState(), {
    type: MACHINE_EVENT_KIND.REQUEST_PANEL_INTENT,
    intent: MACHINE_PANEL_INTENT.PASTE_ARMED,
  });

  assert.equal(result.state.panel.intent, MACHINE_PANEL_INTENT.PASTE_ARMED);
  assert.equal(result.state.panel.requestId, 1);
  assert.deepEqual(result.effects, [
    {
      kind: MACHINE_EFFECT_KIND.READ_PASTE_IMAGE,
      requestId: 1,
    },
    {
      kind: MACHINE_EFFECT_KIND.START_PANEL_TIMEOUT,
      intent: MACHINE_PANEL_INTENT.PASTE_ARMED,
      requestId: 1,
    },
  ]);
  assert.equal(result.historyRecord, null);
});

test("requesting paste again cancels the old request and arms a new one", () => {
  let state = transitionMachine(createInitialMachineState(), {
    type: MACHINE_EVENT_KIND.REQUEST_PANEL_INTENT,
    intent: MACHINE_PANEL_INTENT.PASTE_ARMED,
  }).state;

  const result = transitionMachine(state, {
    type: MACHINE_EVENT_KIND.REQUEST_PANEL_INTENT,
    intent: MACHINE_PANEL_INTENT.PASTE_ARMED,
  });

  assert.equal(result.state.panel.requestId, 2);
  assert.deepEqual(result.effects, [
    {
      kind: MACHINE_EFFECT_KIND.CANCEL_PANEL_TIMEOUT,
      requestId: 1,
    },
    {
      kind: MACHINE_EFFECT_KIND.READ_PASTE_IMAGE,
      requestId: 2,
    },
    {
      kind: MACHINE_EFFECT_KIND.START_PANEL_TIMEOUT,
      intent: MACHINE_PANEL_INTENT.PASTE_ARMED,
      requestId: 2,
    },
  ]);
});

test("cancelling panel intent clears request id and emits cancel-timeout effect", () => {
  const state = transitionMachine(createInitialMachineState(), {
    type: MACHINE_EVENT_KIND.REQUEST_PANEL_INTENT,
    intent: MACHINE_PANEL_INTENT.PASTE_ARMED,
  }).state;

  const result = transitionMachine(state, {
    type: MACHINE_EVENT_KIND.CANCEL_PANEL_INTENT,
  });

  assert.deepEqual(result.state.panel, createIdlePanel());
  assert.deepEqual(result.effects, [
    {
      kind: MACHINE_EFFECT_KIND.CANCEL_PANEL_TIMEOUT,
      requestId: 1,
    },
  ]);
});

test("requesting clear-image confirmation emits a timeout effect", () => {
  const state = loadImageState();

  const result = transitionMachine(state, {
    type: MACHINE_EVENT_KIND.REQUEST_PANEL_INTENT,
    intent: MACHINE_PANEL_INTENT.CLEAR_IMAGE_CONFIRM,
  });

  assert.equal(result.state.panel.intent, MACHINE_PANEL_INTENT.CLEAR_IMAGE_CONFIRM);
  assert.equal(result.state.panel.requestId, 1);
  assert.deepEqual(result.effects, [
    {
      kind: MACHINE_EFFECT_KIND.START_PANEL_TIMEOUT,
      intent: MACHINE_PANEL_INTENT.CLEAR_IMAGE_CONFIRM,
      requestId: 1,
    },
  ]);
});

test("requesting clear-pins confirmation emits a timeout effect", () => {
  const state = addPin(loadImageState()).state;

  const result = transitionMachine(state, {
    type: MACHINE_EVENT_KIND.REQUEST_PANEL_INTENT,
    intent: MACHINE_PANEL_INTENT.CLEAR_PINS_CONFIRM,
  });

  assert.equal(result.state.panel.intent, MACHINE_PANEL_INTENT.CLEAR_PINS_CONFIRM);
  assert.equal(result.state.panel.requestId, 1);
  assert.deepEqual(result.effects, [
    {
      kind: MACHINE_EFFECT_KIND.START_PANEL_TIMEOUT,
      intent: MACHINE_PANEL_INTENT.CLEAR_PINS_CONFIRM,
      requestId: 1,
    },
  ]);
});

test("confirmed clear-image cancels timeout and records clear-image history", () => {
  let state = loadImageState();
  state = transitionMachine(state, {
    type: MACHINE_EVENT_KIND.REQUEST_PANEL_INTENT,
    intent: MACHINE_PANEL_INTENT.CLEAR_IMAGE_CONFIRM,
  }).state;

  const result = transitionMachine(state, {
    type: MACHINE_EVENT_KIND.CLEAR_IMAGE,
  });

  assert.deepEqual(result.state.panel, createIdlePanel());
  assert.deepEqual(result.effects, [
    {
      kind: MACHINE_EFFECT_KIND.CANCEL_PANEL_TIMEOUT,
      requestId: 1,
    },
  ]);
  assert.equal(result.historyRecord.kind, MACHINE_HISTORY_KIND.CLEAR_IMAGE);
});

test("confirmed clear-pins cancels timeout and records clear-pins history", () => {
  let state = addPin(loadImageState()).state;
  state = transitionMachine(state, {
    type: MACHINE_EVENT_KIND.REQUEST_PANEL_INTENT,
    intent: MACHINE_PANEL_INTENT.CLEAR_PINS_CONFIRM,
  }).state;

  const result = transitionMachine(state, {
    type: MACHINE_EVENT_KIND.CLEAR_PINS,
  });

  assert.deepEqual(result.state.panel, createIdlePanel());
  assert.deepEqual(result.effects, [
    {
      kind: MACHINE_EFFECT_KIND.CANCEL_PANEL_TIMEOUT,
      requestId: 1,
    },
  ]);
  assert.equal(result.historyRecord.kind, MACHINE_HISTORY_KIND.CLEAR_PINS);
});

test("loading image after paste cancels timeout and records load-image history", () => {
  let state = transitionMachine(createInitialMachineState(), {
    type: MACHINE_EVENT_KIND.REQUEST_PANEL_INTENT,
    intent: MACHINE_PANEL_INTENT.PASTE_ARMED,
  }).state;

  const result = transitionMachine(state, {
    type: MACHINE_EVENT_KIND.LOAD_IMAGE,
    image: IMAGE,
    placement: PLACEMENT,
  });

  assert.equal(result.state.session.mode, MACHINE_MODE.ALIGN);
  assert.deepEqual(result.state.panel, createIdlePanel());
  assert.deepEqual(result.effects, [
    {
      kind: MACHINE_EFFECT_KIND.CANCEL_PANEL_TIMEOUT,
      requestId: 1,
    },
  ]);
  assert.equal(result.historyRecord.kind, MACHINE_HISTORY_KIND.LOAD_IMAGE);
});

function loadImageState() {
  return transitionMachine(createInitialMachineState(), {
    type: MACHINE_EVENT_KIND.LOAD_IMAGE,
    image: IMAGE,
    placement: PLACEMENT,
  }).state;
}

function addPin(state) {
  return transitionMachine(state, {
    type: MACHINE_EVENT_KIND.ADD_PIN,
    imagePx: { x: 400, y: 200 },
    mapLatLon: { lat: -1.23, lon: 36.84 },
  });
}
