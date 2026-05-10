import test from "node:test";
import assert from "node:assert/strict";

import {
  wireRuntime,
} from "../../../bootstrap/runtime.js";

// Class-a: bootstrap wiring is composition only. It passes dependencies through
// to the runtime factory without inspecting product state, running the app step,
// or executing host effects during construction.
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
