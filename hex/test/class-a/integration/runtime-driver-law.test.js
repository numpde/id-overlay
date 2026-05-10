import test from "node:test";
import assert from "node:assert/strict";

import {
  RuntimeBoundaryError,
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

// Class-a: effect kind is the runtime dispatch key. A declared effect must call
// exactly its matching host handler; neighboring capabilities must stay inert.
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

// Class-a: unknown host work is an integration bug, not a product outcome. The
// runtime must fail loudly instead of silently ignoring, guessing, or converting
// undeclared effects into application facts.
test("runtime rejects unknown effect kinds at the boundary", async () => {
  const runtime = createRuntimeDriver({
    initialState: {},
    effectHandlers: {},
    stepApplication({ state }) {
      return {
        state,
        effects: [{
          kind: "unknown-effect",
        }],
      };
    },
  });

  await assert.rejects(
    () => runtime.dispatch({
      kind: "user-command",
    }),
    (error) => (
      error instanceof RuntimeBoundaryError
        && error.code === "unknown-effect-kind"
    ),
  );
});

// Class-a: runtime dispatch is not an adapter-normalization layer. The matching
// host handler receives exactly the effect emitted by the application.
test("runtime passes effect payloads to handlers unchanged", async () => {
  const effect = {
    kind: "persist-durable-state",
    durableState: {
      session: {
        mode: "align",
        referenceImage: {
          imageDataRef: "reference-image-data-1",
        },
      },
    },
    requestId: "persist-1",
  };
  let handlerEffect = null;
  const runtime = createRuntimeDriver({
    initialState: {},
    effectHandlers: {
      "persist-durable-state": async (receivedEffect) => {
        handlerEffect = receivedEffect;
        return null;
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

  assert.deepEqual(handlerEffect, effect);
});

// Class-a: handler output becomes the next application input. Runtime must not
// interpret host results as state patches or update product state directly.
test("runtime feeds plain effect results back through the application step", async () => {
  const effect = {
    kind: "persist-durable-state",
    durableState: {
      session: {
        mode: "align",
      },
    },
    requestId: "persist-1",
  };
  const effectResult = {
    kind: "durable-state-persisted",
    requestId: "persist-1",
  };
  const applicationCalls = [];
  const runtime = createRuntimeDriver({
    initialState: {
      phase: "idle",
    },
    effectHandlers: {
      "persist-durable-state": async () => effectResult,
    },
    stepApplication({ state, command }) {
      applicationCalls.push({
        state,
        command,
      });
      if (command.kind === "start") {
        return {
          state: {
            phase: "persisting",
          },
          effects: [effect],
        };
      }
      assert.deepEqual(command, effectResult);
      return {
        state: {
          phase: "complete",
        },
        effects: [],
      };
    },
  });

  await runtime.dispatch({
    kind: "start",
  });

  assert.deepEqual(applicationCalls, [
    {
      state: {
        phase: "idle",
      },
      command: {
        kind: "start",
      },
    },
    {
      state: {
        phase: "persisting",
      },
      command: effectResult,
    },
  ]);
  assert.deepEqual(runtime.getState(), {
    phase: "complete",
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
