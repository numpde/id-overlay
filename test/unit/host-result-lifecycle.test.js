import test from "node:test";
import assert from "node:assert/strict";

import {
  MACHINE_EFFECT_KIND,
} from "../../src/core/machine/effect-requests.js";
import {
  createMachineHostResultLifecycle,
} from "../../src/core/machine/host-result-lifecycle.js";
import {
  createMachineRuntime,
} from "../../src/core/machine/runtime.js";
import {
  createInitialMachineState,
} from "../../src/core/machine/state.js";
import { IMAGE, PLACEMENT } from "../helpers/session-fixtures.js";

test("host result lifecycle commits state before notifying persistence and effects", () => {
  const runtime = createMachineRuntime();
  const calls = [];
  const lifecycle = createMachineHostResultLifecycle({
    runtime,
    persistenceService: {
      persistCommittedResult(result, context) {
        calls.push(["persist", runtime.getState(), result, context]);
      },
      destroy() {},
    },
    effectServices: {
      runCommittedEffects(result, context) {
        calls.push(["effects", runtime.getState(), result, context]);
      },
      destroy() {},
    },
  });
  const result = createResult({
    state: createLoadedState(),
    effects: [{ kind: MACHINE_EFFECT_KIND.START_STATUS_TIMEOUT, requestId: 1 }],
  });
  const committed = lifecycle.commitMachineResult(result, { transition: "load-image" });

  assert.equal(committed, result);
  assert.equal(runtime.getState(), result.state);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls.map(([name]) => name), ["persist", "effects"]);
  for (const [, observedState, observedResult, context] of calls) {
    assert.equal(observedState, result.state);
    assert.equal(observedResult, result);
    assert.equal(context.result, result);
    assert.equal(context.state, result.state);
    assert.equal(context.transition, "load-image");
  }
});

test("host result lifecycle destroys observer services in declared order", () => {
  const calls = [];
  const lifecycle = createMachineHostResultLifecycle({
    runtime: createMachineRuntime(),
    persistenceService: {
      persistCommittedResult() {},
      destroy() {
        calls.push("persistence");
      },
    },
    effectServices: {
      runCommittedEffects() {},
      destroy() {
        calls.push("effects");
      },
    },
  });

  lifecycle.destroy();

  assert.deepEqual(calls, ["persistence", "effects"]);
});

function createResult({
  state,
  effects = [],
  historyRecord = null,
  consumedHistoryRecord = null,
}) {
  return {
    state,
    effects,
    historyRecord,
    consumedHistoryRecord,
  };
}

function createLoadedState() {
  return createInitialMachineState({
    session: {
      image: IMAGE,
      placement: PLACEMENT,
    },
  });
}
