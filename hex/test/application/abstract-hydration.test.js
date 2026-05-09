import test from "node:test";
import assert from "node:assert/strict";

import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "../../application/command.js";
import { handleApplicationCommand } from "../../application/handle-command.js";
import { createInitialApplicationState } from "../../application/state.js";
import { assertPlainData } from "./plain-data-assertions.js";

// Hydration is the abstract startup seam: persisted plain data enters the
// application and becomes canonical state. No storage adapter, migration system,
// or product session shape is allowed into this test.

test("application command vocabulary includes explicit hydration", () => {
  assert.equal(APPLICATION_COMMAND_KIND.HYDRATE, "hydrate");

  const command = createApplicationCommand(APPLICATION_COMMAND_KIND.HYDRATE, {
    persistedState: null,
  });

  assertPlainData(command);
  assert.deepEqual(command, {
    kind: "hydrate",
    persistedState: null,
  });
});

// Null is the adapter's plain-data way to say "nothing was persisted". The
// application should turn that into canonical empty state without asking any
// adapter to do more work.
test("hydrating missing persisted state returns empty application state", () => {
  const state = createInitialApplicationState();
  const command = createApplicationCommand(APPLICATION_COMMAND_KIND.HYDRATE, {
    persistedState: null,
  });

  const result = handleApplicationCommand({ state, command });

  assertPlainData(result);
  assert.deepEqual(result, {
    state: {},
    effects: [],
  });
});

// Empty persisted data is currently the only valid durable shape. This keeps the
// persistence seam real while refusing to invent session fields prematurely.
test("hydrating empty persisted state returns empty application state", () => {
  const state = createInitialApplicationState();
  const command = createApplicationCommand(APPLICATION_COMMAND_KIND.HYDRATE, {
    persistedState: {},
  });

  const result = handleApplicationCommand({ state, command });

  assertPlainData(result);
  assert.deepEqual(result, {
    state: {},
    effects: [],
  });
});

// Unknown persisted fields are external input, not application vocabulary. While
// no durable product facts exist, the only safe canonicalization is to drop them.
test("hydrating unknown persisted fields drops them while no durable facts exist", () => {
  const state = createInitialApplicationState();
  const command = createApplicationCommand(APPLICATION_COMMAND_KIND.HYDRATE, {
    persistedState: {
      futureField: true,
      nested: {
        value: 1,
      },
    },
  });

  const result = handleApplicationCommand({ state, command });

  assertPlainData(result);
  assert.deepEqual(result, {
    state: {},
    effects: [],
  });
});

// Hydration is tolerant of unknown JSON fields, not of runtime objects. Rich
// values at this boundary would mean an adapter leaked platform data inward.
test("hydration rejects non-data persisted state", () => {
  assert.throws(
    () => createApplicationCommand(APPLICATION_COMMAND_KIND.HYDRATE, {
      persistedState: new Map(),
    }),
    /plain persisted state/i,
  );
});
