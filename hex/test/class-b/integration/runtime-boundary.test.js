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
