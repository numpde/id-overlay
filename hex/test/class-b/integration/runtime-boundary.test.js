import test from "node:test";
import assert from "node:assert/strict";

import {
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
