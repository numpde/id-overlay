import test from "node:test";
import assert from "node:assert/strict";

import {
  RuntimeBoundaryError,
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

// Class-b: unknown host work is an integration bug, not a product outcome.
// Runtime must fail loudly instead of silently ignoring or guessing.
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

// Class-b: runtime dispatch is not an adapter-normalization layer. The selected
// handler receives the effect as emitted by the application.
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

// Class-b: handler output becomes the next application input. Runtime must not
// interpret the result as a state patch or update product state directly.
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

// Class-b: expected handler failures become plain application facts. Runtime
// exposes stable diagnostics without leaking stack traces or thrown objects.
test("runtime converts handler failures into plain application facts", async () => {
  const effect = {
    kind: "read-reference-image",
    requestId: "paste-1",
  };
  const applicationCommands = [];
  const runtime = createRuntimeDriver({
    initialState: {},
    effectHandlers: {
      "read-reference-image": async () => {
        throw new Error("permission denied");
      },
    },
    stepApplication({ state, command }) {
      applicationCommands.push(command);
      if (command.kind === "start") {
        return {
          state,
          effects: [effect],
        };
      }

      assert.equal(command.kind, "runtime-effect-failed");
      assert.equal(command.effectKind, "read-reference-image");
      assert.equal(command.requestId, "paste-1");
      assert.equal(command.error.code, "effect-handler-failed");
      assert.equal("stack" in command.error, false);
      assertPlainData(command);
      return {
        state,
        effects: [],
      };
    },
  });

  await runtime.dispatch({
    kind: "start",
  });

  assert.equal(applicationCommands.length, 2);
});

// Class-b: runtime preserves correlation identity but does not interpret it.
// Request staleness is application policy, not driver policy.
test("runtime preserves correlation ids and leaves staleness decisions to the application", async () => {
  const applicationCommands = [];
  const runtime = createRuntimeDriver({
    initialState: {
      notice: {
        kind: "newer-notice",
        requestId: 2,
      },
    },
    effectHandlers: {
      "clear-status-after-delay": async () => ({
        kind: "clear-status-notice",
        requestId: 1,
      }),
    },
    stepApplication({ state, command }) {
      applicationCommands.push(command);
      if (command.kind === "start") {
        return {
          state,
          effects: [{
            kind: "clear-status-after-delay",
            requestId: 1,
          }],
        };
      }
      assert.deepEqual(command, {
        kind: "clear-status-notice",
        requestId: 1,
      });
      return {
        state,
        effects: [],
      };
    },
  });

  await runtime.dispatch({
    kind: "start",
  });

  assert.deepEqual(applicationCommands.map((command) => command.requestId ?? null), [
    null,
    1,
  ]);
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

function assertPlainData(value) {
  if (value === null) {
    return;
  }
  if (Array.isArray(value)) {
    for (const nestedValue of value) {
      assertPlainData(nestedValue);
    }
    return;
  }

  const valueType = typeof value;
  if (["string", "boolean"].includes(valueType)) {
    return;
  }
  if (valueType === "number") {
    assert.equal(Number.isFinite(value), true);
    return;
  }

  assert.equal(valueType, "object");
  assert.equal(Object.getPrototypeOf(value), Object.prototype);
  for (const [key, nestedValue] of Object.entries(value)) {
    assert.equal(typeof key, "string");
    assertPlainData(nestedValue);
  }
}
