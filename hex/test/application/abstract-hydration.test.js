import test from "node:test";
import assert from "node:assert/strict";

import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "../../application/command.js";
import {
  APPLICATION_BOUNDARY_ERROR_CODE,
} from "../../application/errors.js";
import { handleApplicationCommand } from "../../application/handle-command.js";
import { createInitialApplicationState } from "../../application/state.js";
import { assertApplicationBoundaryError } from "./application-boundary-assertions.js";
import { assertApplicationResult } from "./application-result-assertions.js";
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

  assertApplicationResult(result, {
    state: {},
    effects: [],
  });
});

// Empty persisted data is the only valid durable shape until a product field is
// specified. This keeps the persistence seam real without inventing session
// fields prematurely.
test("hydrating empty persisted state returns empty application state", () => {
  const state = createInitialApplicationState();
  const command = createApplicationCommand(APPLICATION_COMMAND_KIND.HYDRATE, {
    persistedState: {},
  });

  const result = handleApplicationCommand({ state, command });

  assertApplicationResult(result, {
    state: {},
    effects: [],
  });
});

// Unknown persisted fields are not a migration problem yet; there is no durable
// vocabulary to migrate. Rejecting them avoids silently choosing a data-loss or
// forward-compatibility policy before a real product field forces that decision.
test("hydrating unknown persisted fields rejects non-empty persisted data", () => {
  const state = createInitialApplicationState();
  const command = createApplicationCommand(APPLICATION_COMMAND_KIND.HYDRATE, {
    persistedState: {
      futureField: true,
      nested: {
        value: 1,
      },
    },
  });

  assertApplicationBoundaryError(
    () => handleApplicationCommand({ state, command }),
    APPLICATION_BOUNDARY_ERROR_CODE.UNSUPPORTED_PERSISTED_STATE,
  );
});

// Hydration input must still be plain data before the application can decide
// whether the persisted shape is supported. Rich values here mean an adapter
// leaked platform data inward.
test("hydration rejects non-data persisted state", () => {
  assertApplicationBoundaryError(
    () => createApplicationCommand(APPLICATION_COMMAND_KIND.HYDRATE, {
      persistedState: new Map(),
    }),
    APPLICATION_BOUNDARY_ERROR_CODE.INVALID_PERSISTED_STATE,
  );
});
