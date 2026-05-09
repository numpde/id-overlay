import test from "node:test";
import assert from "node:assert/strict";

import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "../../../application/command.js";
import {
  APPLICATION_BOUNDARY_ERROR_CODE,
} from "../../../application/errors.js";
import { assertApplicationBoundaryError } from "./application-boundary-assertions.js";
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
