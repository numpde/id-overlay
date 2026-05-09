import test from "node:test";
import assert from "node:assert/strict";

import {
  createRuntimeDriver,
} from "../../../bootstrap/runtime.js";

// Class-b: the runtime is a driver, not a product-policy layer. Product facts
// stay opaque to it; only the application step may interpret state fields.
test("runtime driver does not inspect product state fields", async () => {
  const command = {
    kind: "user-command",
  };
  const state = createOpaqueProductState({
    session: {
      mode: "align",
      pins: [],
    },
    status: "Loaded screenshot.",
  });
  let stepCallCount = 0;

  const runtime = createRuntimeDriver({
    initialState: state,
    effectHandlers: {},
    stepApplication({ state: receivedState, command: receivedCommand }) {
      stepCallCount += 1;
      assert.equal(receivedState, state);
      assert.equal(receivedCommand, command);
      return {
        state: receivedState,
        effects: [],
      };
    },
  });

  await runtime.dispatch(command);

  assert.equal(stepCallCount, 1);
});

// Class-b: app output is the only source of host work. The runtime must not
// infer persistence, timers, paste reads, or any other effect from state shape.
test("runtime runs only effects returned by the application step", async () => {
  const state = {
    durableState: {
      session: {
        mode: "align",
      },
    },
  };
  const runtime = createRuntimeDriver({
    initialState: state,
    effectHandlers: {
      "persist-durable-state": () => {
        assert.fail("runtime invented persistence from state inspection");
      },
    },
    stepApplication() {
      return {
        state,
        effects: [],
      };
    },
  });

  await runtime.dispatch({
    kind: "user-command",
  });
});

// Class-b: effect kind is the runtime dispatch key. A declared effect must call
// exactly its matching handler and no neighboring handler.
test("runtime dispatches each declared effect kind to its matching handler", async () => {
  const effect = {
    kind: "persist-durable-state",
    durableState: {
      session: {
        mode: "trace",
      },
    },
  };
  const calls = [];
  const runtime = createRuntimeDriver({
    initialState: {},
    effectHandlers: {
      "persist-durable-state": async (receivedEffect) => {
        calls.push({
          handler: "persist-durable-state",
          effect: receivedEffect,
        });
        return null;
      },
      "read-reference-image": () => {
        assert.fail("runtime called a handler whose kind was not requested");
      },
    },
    stepApplication({ state }) {
      return {
        state,
        effects: [effect],
      };
    },
  });

  await runtime.dispatch({
    kind: "user-command",
  });

  assert.deepEqual(calls, [{
    handler: "persist-durable-state",
    effect,
  }]);
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
