import test from "node:test";
import assert from "node:assert/strict";

import {
  createMachineHostPersistenceService,
} from "../../src/core/machine/host-persistence-service.js";
import {
  createInitialMachineState,
} from "../../src/core/machine/state.js";
import {
  IMAGE,
  NORMALIZED_IMAGE,
  PLACEMENT,
} from "../helpers/session-fixtures.js";

test("machine host persistence service observes committed results only when durable state changes", () => {
  const saves = [];
  const service = createMachineHostPersistenceService({
    initialState: createInitialMachineState(),
    savePersistedSession: (session) => saves.push(session),
  });

  service.persistCommittedResult({ state: createInitialMachineState() });
  service.persistCommittedResult({ state: createLoadedState() });
  service.persistCommittedResult({ state: createLoadedState() });

  assert.deepEqual(saves, [{
    mode: "trace",
    opacity: 0.6,
    image: NORMALIZED_IMAGE,
    placement: PLACEMENT,
    registration: {
      pins: [],
      solvedTransform: null,
      dirty: false,
    },
  }]);
});

test("machine host persistence service reports sync and async save failures", async () => {
  const syncError = new Error("sync save failed");
  const asyncError = new Error("async save failed");
  const errors = [];
  const service = createMachineHostPersistenceService({
    initialState: createInitialMachineState(),
    savePersistedSession: (session) => {
      if (session.image) {
        throw syncError;
      }
      return Promise.reject(asyncError);
    },
    reportError: (error, context) => errors.push([error, context]),
  });

  service.persistCommittedResult({ state: createLoadedState() });
  service.persistCommittedResult({ state: createInitialMachineState({ session: { opacity: 0.7 } }) });
  await Promise.resolve();

  assert.deepEqual(errors, [
    [syncError, { operation: "save" }],
    [asyncError, { operation: "save" }],
  ]);
});

function createLoadedState() {
  return createInitialMachineState({
    session: {
      image: IMAGE,
      placement: PLACEMENT,
    },
  });
}
