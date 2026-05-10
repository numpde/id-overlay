import test from "node:test";
import assert from "node:assert/strict";

import {
  createRuntimeDriver,
} from "../../../bootstrap/runtime.js";

// Class-a: the runtime is a hexagonal sequencer, not a product reducer. It may
// hold and pass state by identity, but it must never inspect product fields; all
// product interpretation belongs to the application step.
test("runtime driver treats product state as opaque", async () => {
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

// Class-a: application output is the only source of host work. The runtime must
// not infer persistence, timers, input reads, or any other effect from state
// shape; only declared effects cross outward.
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
