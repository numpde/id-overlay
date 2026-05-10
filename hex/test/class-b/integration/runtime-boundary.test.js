import test from "node:test";
import assert from "node:assert/strict";

import {
  RuntimeBoundaryError,
  createRuntimeDriver,
  wireRuntime,
} from "../../../bootstrap/runtime.js";

// Class-b, not class-a: a future runtime could introduce explicit parallel
// scheduling, but this driver currently offers deterministic serial effects.
// If an application emits effects in order, the next effect starts only after
// the prior effect has finished and had its chance to re-enter the app.
test("runtime executes multiple effects in declared order", async () => {
  const order = [];
  let firstFinished = false;
  const runtime = createRuntimeDriver({
    initialState: {},
    effectHandlers: {
      first: async () => {
        order.push("first:start");
        await Promise.resolve();
        firstFinished = true;
        order.push("first:end");
        return null;
      },
      second: async () => {
        assert.equal(firstFinished, true);
        order.push("second");
        return null;
      },
    },
    stepApplication({ state }) {
      return {
        state,
        effects: [
          {
            kind: "first",
          },
          {
            kind: "second",
          },
        ],
      };
    },
  });

  await runtime.dispatch({
    kind: "start",
  });

  assert.deepEqual(order, [
    "first:start",
    "first:end",
    "second",
  ]);
});

// Class-b: runtime is sequencing, not mutation. App inputs, emitted effects,
// and handler results remain caller-owned values.
test("runtime does not mutate state commands effects or handler results", async () => {
  const state = deepFreeze({
    session: {
      mode: "align",
    },
  });
  const command = deepFreeze({
    kind: "start",
  });
  const effect = deepFreeze({
    kind: "read-reference-image",
    requestId: "paste-1",
  });
  const handlerResult = deepFreeze({
    kind: "reference-image-read",
    requestId: "paste-1",
    outcome: {
      kind: "empty",
    },
  });
  const runtime = createRuntimeDriver({
    initialState: state,
    effectHandlers: {
      "read-reference-image": async () => handlerResult,
    },
    stepApplication({ state: receivedState, command: receivedCommand }) {
      if (receivedCommand.kind === "start") {
        return {
          state: receivedState,
          effects: [effect],
        };
      }
      return {
        state: {
          done: true,
        },
        effects: [],
      };
    },
  });

  await runtime.dispatch(command);

  assert.deepEqual(state, {
    session: {
      mode: "align",
    },
  });
  assert.deepEqual(command, {
    kind: "start",
  });
  assert.deepEqual(effect, {
    kind: "read-reference-image",
    requestId: "paste-1",
  });
  assert.deepEqual(handlerResult, {
    kind: "reference-image-read",
    requestId: "paste-1",
    outcome: {
      kind: "empty",
    },
  });
});

// Class-b: disposal closes the ingress gate. Late async results may settle, but
// they must not be delivered to the application after the runtime is disposed.
test("runtime disposal prevents late effect results from re-entering the app", async () => {
  const applicationCommands = [];
  let resolveLateResult = null;
  const lateResult = new Promise((resolve) => {
    resolveLateResult = resolve;
  });
  const runtime = createRuntimeDriver({
    initialState: {},
    effectHandlers: {
      "read-reference-image": async () => lateResult,
    },
    stepApplication({ state, command }) {
      applicationCommands.push(command);
      return {
        state,
        effects: command.kind === "start"
          ? [{
            kind: "read-reference-image",
            requestId: "paste-1",
          }]
          : [],
      };
    },
  });

  const dispatch = runtime.dispatch({
    kind: "start",
  });
  runtime.dispose();
  resolveLateResult({
    kind: "reference-image-read",
    requestId: "paste-1",
    outcome: {
      kind: "empty",
    },
  });

  await assert.doesNotReject(dispatch);
  assert.deepEqual(applicationCommands, [{
    kind: "start",
  }]);
});

// Class-b: runtime owns subscription cleanup. Disposal is idempotent and calls
// each registered disposer once.
test("runtime disposal calls registered disposers exactly once", () => {
  const calls = [];
  const runtime = createRuntimeDriver({
    initialState: {},
    effectHandlers: {},
    stepApplication({ state }) {
      return {
        state,
        effects: [],
      };
    },
    subscriptions: [
      () => {
        calls.push("first");
      },
      () => {
        calls.push("second");
      },
    ],
  });

  runtime.dispose();
  runtime.dispose();

  assert.deepEqual(calls, [
    "first",
    "second",
  ]);
});

// Class-b: bootstrap composes dependencies. It must not run application logic,
// execute effects, or inspect product state while wiring the runtime.
test("bootstrap wiring does not inspect product state or execute app behavior", () => {
  const initialState = createOpaqueProductState({
    session: {
      mode: "align",
      pins: [],
    },
  });
  const stepApplication = () => {
    assert.fail("bootstrap must not run the app step while wiring");
  };
  const effectHandlers = {
    "persist-durable-state": () => {
      assert.fail("bootstrap must not run effect handlers while wiring");
    },
  };
  const fakeRuntime = {
    dispose() {},
    dispatch() {},
  };
  let captured = null;

  const runtime = wireRuntime({
    initialState,
    stepApplication,
    effectHandlers,
    createRuntimeDriver(dependencies) {
      captured = dependencies;
      return fakeRuntime;
    },
  });

  assert.equal(runtime, fakeRuntime);
  assert.equal(captured.initialState, initialState);
  assert.equal(captured.stepApplication, stepApplication);
  assert.equal(captured.effectHandlers, effectHandlers);
});

function createOpaqueProductState(value) {
  const forbiddenProductFields = new Set([
    "mode",
    "pins",
    "session",
    "status",
  ]);

  return new Proxy(value, {
    get(target, property, receiver) {
      if (forbiddenProductFields.has(property)) {
        assert.fail(`runtime inspected product field ${String(property)}`);
      }
      return Reflect.get(target, property, receiver);
    },
    ownKeys() {
      assert.fail("runtime enumerated product state fields");
    },
  });
}

function deepFreeze(value) {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const nestedValue of Object.values(value)) {
    deepFreeze(nestedValue);
  }
  return value;
}
