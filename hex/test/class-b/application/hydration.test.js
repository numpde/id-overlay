import test from "node:test";
import assert from "node:assert/strict";

import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "../../../application/command.js";
import {
  APPLICATION_BOUNDARY_ERROR_CODE,
} from "../../../application/errors.js";
import { handleApplicationCommand } from "../../../application/handle-command.js";
import { createInitialApplicationState } from "../../../application/state.js";
import { assertApplicationBoundaryError } from "./application-boundary-assertions.js";
import { assertApplicationResult } from "./application-result-assertions.js";
import { assertPlainData } from "./plain-data-assertions.js";

// Hydration is the startup seam: durable plain data enters the application and
// becomes canonical state. How that durable data was kept is an adapter concern.

test("application command vocabulary includes explicit hydration", () => {
  assert.equal(APPLICATION_COMMAND_KIND.HYDRATE, "hydrate");

  const command = createApplicationCommand(APPLICATION_COMMAND_KIND.HYDRATE, {
    durableState: null,
  });

  assertPlainData(command);
  assert.deepEqual(command, {
    kind: "hydrate",
    durableState: null,
  });
});

// Null is the caller's plain-data way to say "no durable state exists". The
// application should turn that into canonical empty state without asking the
// caller to do more work.
test("hydrating missing durable state returns empty application state", () => {
  const state = createInitialApplicationState();
  const command = createApplicationCommand(APPLICATION_COMMAND_KIND.HYDRATE, {
    durableState: null,
  });

  const result = handleApplicationCommand({ state, command });

  assertApplicationResult(result, {
    state: {},
    effects: [],
  });
});

// Empty durable data is the explicit no-session durable shape.
test("hydrating empty durable state returns empty application state", () => {
  const state = createInitialApplicationState();
  const command = createApplicationCommand(APPLICATION_COMMAND_KIND.HYDRATE, {
    durableState: {},
  });

  const result = handleApplicationCommand({ state, command });

  assertApplicationResult(result, {
    state: {},
    effects: [],
  });
});

// Hydration input must still be plain data before the application can decide
// whether the durable shape is supported. Rich values here mean the caller
// leaked runtime data inward.
test("hydration rejects non-data durable state", () => {
  assert.equal(
    APPLICATION_BOUNDARY_ERROR_CODE.INVALID_DURABLE_STATE,
    "invalid-durable-state",
  );

  assertApplicationBoundaryError(
    () => createApplicationCommand(APPLICATION_COMMAND_KIND.HYDRATE, {
      durableState: new Map(),
    }),
    APPLICATION_BOUNDARY_ERROR_CODE.INVALID_DURABLE_STATE,
  );
});
