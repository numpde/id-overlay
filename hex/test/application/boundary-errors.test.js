import test from "node:test";
import assert from "node:assert/strict";

import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "../../application/command.js";
import {
  ApplicationBoundaryError,
  APPLICATION_BOUNDARY_ERROR_CODE,
} from "../../application/errors.js";
import { handleApplicationCommand } from "../../application/handle-command.js";
import { createApplicationResult } from "../../application/result.js";

// Boundary errors are first-class programmer/configuration failures. They are
// stable enough for diagnostics, but they are not product facts and must never
// be converted into application state.

test("application boundary error exposes stable identity and code", () => {
  assert.equal(Object.isFrozen(APPLICATION_BOUNDARY_ERROR_CODE), true);
  assert.equal(
    APPLICATION_BOUNDARY_ERROR_CODE.UNKNOWN_APPLICATION_COMMAND,
    "unknown-application-command",
  );
  assert.equal(
    APPLICATION_BOUNDARY_ERROR_CODE.INVALID_APPLICATION_STATE,
    "invalid-application-state",
  );
  assert.equal(
    APPLICATION_BOUNDARY_ERROR_CODE.INVALID_EFFECT_REQUEST,
    "invalid-effect-request",
  );

  const error = new ApplicationBoundaryError({
    code: APPLICATION_BOUNDARY_ERROR_CODE.UNKNOWN_APPLICATION_COMMAND,
    message: "Unknown application command.",
  });

  assert.equal(error.name, "ApplicationBoundaryError");
  assert.equal(
    error.code,
    APPLICATION_BOUNDARY_ERROR_CODE.UNKNOWN_APPLICATION_COMMAND,
  );
  assert.equal(error instanceof Error, true);
});

test("unknown commands throw ApplicationBoundaryError", () => {
  assertApplicationBoundaryError(
    () => createApplicationCommand("unknown-command"),
    APPLICATION_BOUNDARY_ERROR_CODE.UNKNOWN_APPLICATION_COMMAND,
  );
});

test("missing command at the application boundary throws ApplicationBoundaryError", () => {
  assertApplicationBoundaryError(
    () => handleApplicationCommand({ state: {} }),
    APPLICATION_BOUNDARY_ERROR_CODE.UNKNOWN_APPLICATION_COMMAND,
  );
});

test("invalid application state throws ApplicationBoundaryError", () => {
  const command = createApplicationCommand(APPLICATION_COMMAND_KIND.NOOP);

  assertApplicationBoundaryError(
    () => handleApplicationCommand({ command }),
    APPLICATION_BOUNDARY_ERROR_CODE.INVALID_APPLICATION_STATE,
  );
  assertApplicationBoundaryError(
    () => createApplicationResult({
      state: new Map(),
      effects: [],
    }),
    APPLICATION_BOUNDARY_ERROR_CODE.INVALID_APPLICATION_STATE,
  );
});

test("invalid effect requests throw ApplicationBoundaryError", () => {
  assertApplicationBoundaryError(
    () => createApplicationResult({
      state: {},
      effects: [new Map()],
    }),
    APPLICATION_BOUNDARY_ERROR_CODE.INVALID_EFFECT_REQUEST,
  );
  assertApplicationBoundaryError(
    () => createApplicationResult({
      state: {},
      effects: [{ kind: "unknown-effect" }],
    }),
    APPLICATION_BOUNDARY_ERROR_CODE.INVALID_EFFECT_REQUEST,
  );
});

// The application should throw deliberate boundary errors; it should not catch
// them and return error-shaped state or effects. Recoverable external failures
// will enter later as typed facts, not as exceptions.
test("application boundary errors are thrown, not returned as application data", () => {
  const command = createApplicationCommand(APPLICATION_COMMAND_KIND.NOOP);

  assert.throws(
    () => handleApplicationCommand({
      state: new Map(),
      command,
    }),
    ApplicationBoundaryError,
  );
});

function assertApplicationBoundaryError(run, expectedCode) {
  assert.throws(
    run,
    (error) => (
      error instanceof ApplicationBoundaryError
        && error.name === "ApplicationBoundaryError"
        && error.code === expectedCode
    ),
  );
}
