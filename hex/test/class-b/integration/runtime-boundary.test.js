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

// Class-b: port results must be plain data before they re-enter the app. Rich
// runtime handles are stopped at the boundary.
test("runtime rejects non-plain handler results before app re-entry", async () => {
  const runtime = createRuntimeDriver({
    initialState: {},
    effectHandlers: {
      "read-reference-image": async () => ({
        kind: "reference-image-read",
        runtimeHandle: new Map(),
      }),
    },
    stepApplication({ state, command }) {
      if (command.kind !== "start") {
        assert.fail("non-plain handler result reached the application step");
      }
      return {
        state,
        effects: [{
          kind: "read-reference-image",
          requestId: "paste-1",
        }],
      };
    },
  });

  await assert.rejects(
    () => runtime.dispatch({
      kind: "start",
    }),
    (error) => (
      error instanceof RuntimeBoundaryError
        && error.code === "non-plain-effect-result"
    ),
  );
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
