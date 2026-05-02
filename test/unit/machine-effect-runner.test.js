import test from "node:test";
import assert from "node:assert/strict";

import {
  MACHINE_EFFECT_KIND,
  MACHINE_EVENT_KIND,
  MACHINE_PANEL_INTENT,
  createCancelPanelIntentEvent,
  createInitialMachineState,
  createLoadImageEvent,
  createMachineEffectRunner,
} from "../../src/core/machine/index.js";

const IMAGE = Object.freeze({
  src: "data:image/png;base64,abc",
  width: 800,
  height: 400,
});

test("event constructors centralize effect-runner outcome event shapes", () => {
  assert.deepEqual(createLoadImageEvent({
    image: IMAGE,
    requestId: 7,
  }), {
    type: MACHINE_EVENT_KIND.LOAD_IMAGE,
    image: IMAGE,
    placement: null,
    requestId: 7,
  });
  assert.deepEqual(createCancelPanelIntentEvent({ requestId: 7 }), {
    type: MACHINE_EVENT_KIND.CANCEL_PANEL_INTENT,
    requestId: 7,
  });
});

test("machine effect runner ignores unknown effects", async () => {
  const calls = [];
  const runEffect = createMachineEffectRunner({
    readPasteImage: () => calls.push("paste"),
    startPanelTimeout: () => calls.push("start"),
    cancelPanelTimeout: () => calls.push("cancel"),
    dispatch: (event) => calls.push(event),
    getState: createIdleState,
  });

  await runEffect({ kind: "unknown-effect" }, createContext());

  assert.deepEqual(calls, []);
});

test("start-panel-timeout delegates the exact intent and request id", async () => {
  const calls = [];
  const context = createContext();
  const runEffect = createMachineEffectRunner({
    startPanelTimeout: (payload) => calls.push(payload),
    getState: createIdleState,
  });

  await runEffect({
    kind: MACHINE_EFFECT_KIND.START_PANEL_TIMEOUT,
    intent: MACHINE_PANEL_INTENT.PASTE_ARMED,
    requestId: 7,
  }, context);

  assert.deepEqual(calls, [{
    intent: MACHINE_PANEL_INTENT.PASTE_ARMED,
    requestId: 7,
    context,
  }]);
});

test("cancel-panel-timeout delegates the exact request id", async () => {
  const calls = [];
  const context = createContext();
  const runEffect = createMachineEffectRunner({
    cancelPanelTimeout: (payload) => calls.push(payload),
    getState: createIdleState,
  });

  await runEffect({
    kind: MACHINE_EFFECT_KIND.CANCEL_PANEL_TIMEOUT,
    requestId: 7,
  }, context);

  assert.deepEqual(calls, [{
    requestId: 7,
    context,
  }]);
});

test("read-paste-image delegates request id and dispatches load-image when image is returned", async () => {
  const calls = [];
  const context = createContext();
  const runEffect = createMachineEffectRunner({
    readPasteImage: (payload) => {
      calls.push(["read", payload]);
      return IMAGE;
    },
    dispatch: (event) => calls.push(["dispatch", event]),
    getState: createPasteState(7),
  });

  await runEffect({
    kind: MACHINE_EFFECT_KIND.READ_PASTE_IMAGE,
    requestId: 7,
  }, context);

  assert.deepEqual(calls, [
    ["read", { requestId: 7, context }],
    ["dispatch", {
      type: MACHINE_EVENT_KIND.LOAD_IMAGE,
      image: IMAGE,
      placement: null,
      requestId: 7,
    }],
  ]);
});

test("read-paste-image dispatches nothing when no paste adapter is installed", async () => {
  const calls = [];
  const runEffect = createMachineEffectRunner({
    dispatch: (event) => calls.push(event),
    getState: createPasteState(7),
  });

  await runEffect({
    kind: MACHINE_EFFECT_KIND.READ_PASTE_IMAGE,
    requestId: 7,
  }, createContext());

  assert.deepEqual(calls, []);
});

test("read-paste-image does nothing after image result when request is stale", async () => {
  const calls = [];
  const runEffect = createMachineEffectRunner({
    readPasteImage: () => IMAGE,
    dispatch: (event) => calls.push(event),
    getState: createPasteState(8),
  });

  await runEffect({
    kind: MACHINE_EFFECT_KIND.READ_PASTE_IMAGE,
    requestId: 7,
  }, createContext());

  assert.deepEqual(calls, []);
});

test("read-paste-image dispatches cancel when no image is returned and request is current", async () => {
  const calls = [];
  const runEffect = createMachineEffectRunner({
    readPasteImage: () => null,
    dispatch: (event) => calls.push(event),
    getState: createPasteState(7),
  });

  await runEffect({
    kind: MACHINE_EFFECT_KIND.READ_PASTE_IMAGE,
    requestId: 7,
  }, createContext());

  assert.deepEqual(calls, [{
    type: MACHINE_EVENT_KIND.CANCEL_PANEL_INTENT,
    requestId: 7,
  }]);
});

test("read-paste-image does nothing after null result when request is stale", async () => {
  const calls = [];
  const runEffect = createMachineEffectRunner({
    readPasteImage: () => null,
    dispatch: (event) => calls.push(event),
    getState: createPasteState(8),
  });

  await runEffect({
    kind: MACHINE_EFFECT_KIND.READ_PASTE_IMAGE,
    requestId: 7,
  }, createContext());

  assert.deepEqual(calls, []);
});

test("sync callback throw reports onError and does not rethrow", async () => {
  const errors = [];
  const effect = {
    kind: MACHINE_EFFECT_KIND.START_PANEL_TIMEOUT,
    intent: MACHINE_PANEL_INTENT.PASTE_ARMED,
    requestId: 7,
  };
  const context = createContext();
  const runEffect = createMachineEffectRunner({
    startPanelTimeout: () => {
      throw new Error("boom");
    },
    getState: createIdleState,
    onError: (error, payload) => errors.push({ error, payload }),
  });

  await runEffect(effect, context);

  assert.equal(errors.length, 1);
  assert.equal(errors[0].error.message, "boom");
  assert.deepEqual(errors[0].payload, { effect, context });
});

test("async callback rejection reports onError and does not rethrow", async () => {
  const errors = [];
  const effect = {
    kind: MACHINE_EFFECT_KIND.CANCEL_PANEL_TIMEOUT,
    requestId: 7,
  };
  const context = createContext();
  const runEffect = createMachineEffectRunner({
    cancelPanelTimeout: () => Promise.reject(new Error("async boom")),
    getState: createIdleState,
    onError: (error, payload) => errors.push({ error, payload }),
  });

  await runEffect(effect, context);

  assert.equal(errors.length, 1);
  assert.equal(errors[0].error.message, "async boom");
  assert.deepEqual(errors[0].payload, { effect, context });
});

function createContext() {
  return {
    event: { type: "source-event" },
    state: createInitialMachineState(),
    result: { state: createInitialMachineState() },
  };
}

function createIdleState() {
  return createInitialMachineState();
}

function createPasteState(requestId) {
  return () => createInitialMachineState({
    panel: {
      intent: MACHINE_PANEL_INTENT.PASTE_ARMED,
      requestId,
    },
  });
}
