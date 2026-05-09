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

// Boundary errors are first-class application contract failures. They are stable
// enough for diagnostics, but they are not product facts and must never be
// converted into application state.

test("application boundary error exposes stable identity and code", () => {
  assert.equal(Object.isFrozen(APPLICATION_BOUNDARY_ERROR_CODE), true);
  assert.equal(
    APPLICATION_BOUNDARY_ERROR_CODE.UNKNOWN_APPLICATION_COMMAND,
    "unknown-application-command",
  );
  assert.equal(
    APPLICATION_BOUNDARY_ERROR_CODE.INVALID_APPLICATION_COMMAND,
    "invalid-application-command",
  );
  assert.equal(
    APPLICATION_BOUNDARY_ERROR_CODE.INVALID_APPLICATION_STATE,
    "invalid-application-state",
  );
  assert.equal(
    APPLICATION_BOUNDARY_ERROR_CODE.INVALID_EFFECT_REQUEST,
    "invalid-effect-request",
  );
  assert.equal(
    APPLICATION_BOUNDARY_ERROR_CODE.INVALID_PERSISTED_STATE,
    "invalid-persisted-state",
  );
  assert.equal(
    APPLICATION_BOUNDARY_ERROR_CODE.UNSUPPORTED_PERSISTED_STATE,
    "unsupported-persisted-state",
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

// Command validation is the first application gate. Unknown command names are
// not recoverable product events; they mean the caller used an undeclared API.
test("unknown commands throw ApplicationBoundaryError", () => {
  assertApplicationBoundaryError(
    () => createApplicationCommand("unknown-command"),
    APPLICATION_BOUNDARY_ERROR_CODE.UNKNOWN_APPLICATION_COMMAND,
  );
});

// The command handler should not infer intent from a partial envelope. Missing
// command data is the same contract failure as an unknown command kind.
test("missing command at the application boundary throws ApplicationBoundaryError", () => {
  assertApplicationBoundaryError(
    () => handleApplicationCommand({ state: {} }),
    APPLICATION_BOUNDARY_ERROR_CODE.UNKNOWN_APPLICATION_COMMAND,
  );
});

// State validation belongs at every application entry and exit. This prevents
// runtime objects from becoming product state through either command handling or
// direct result construction.
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

// Effects are the only executable work leaving the application. Invalid effect
// data must fail before a shell/effect runner can interpret it dynamically.
test("invalid effect requests throw ApplicationBoundaryError", () => {
  assertApplicationBoundaryError(
    () => createApplicationResult({
      state: {},
    }),
    APPLICATION_BOUNDARY_ERROR_CODE.INVALID_EFFECT_REQUEST,
  );
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

// Invalid persisted state is about data shape: the adapter leaked a runtime
// object or otherwise failed to provide platform-neutral persisted data.
test("invalid persisted state throws ApplicationBoundaryError", () => {
  assertApplicationBoundaryError(
    () => createApplicationCommand(APPLICATION_COMMAND_KIND.HYDRATE, {
      persistedState: new Map(),
    }),
    APPLICATION_BOUNDARY_ERROR_CODE.INVALID_PERSISTED_STATE,
  );
});

// Unsupported persisted state is different from invalid data shape: it is plain
// data, but the application has not declared any durable vocabulary for it yet.
test("unsupported persisted state throws ApplicationBoundaryError", () => {
  const command = createApplicationCommand(APPLICATION_COMMAND_KIND.HYDRATE, {
    persistedState: {
      futureField: true,
    },
  });

  assertApplicationBoundaryError(
    () => handleApplicationCommand({ state: {}, command }),
    APPLICATION_BOUNDARY_ERROR_CODE.UNSUPPORTED_PERSISTED_STATE,
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
