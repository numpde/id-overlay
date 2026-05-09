import test from "node:test";
import assert from "node:assert/strict";

import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "../../../application/command.js";
import {
  ApplicationBoundaryError,
  APPLICATION_BOUNDARY_ERROR_CODE,
} from "../../../application/errors.js";
import { handleApplicationCommand } from "../../../application/handle-command.js";
import { createInitialApplicationState } from "../../../application/state.js";

// Class-b candidate for class-a: application boundary data stays plain. The
// only non-plain value here is the thrown Error object; its exposed diagnostics
// still stay stable strings.

test("application state commands and results are plain data", () => {
  const state = createInitialApplicationState();
  const command = createApplicationCommand(APPLICATION_COMMAND_KIND.HYDRATE, {
    durableState: null,
  });
  const result = handleApplicationCommand({ state, command });

  assertPlainData(state);
  assertPlainData(command);
  assertPlainData(result);
});

test("application boundary errors expose plain diagnostic fields", () => {
  const error = new ApplicationBoundaryError({
    code: APPLICATION_BOUNDARY_ERROR_CODE.UNKNOWN_APPLICATION_COMMAND,
    message: "Unknown application command.",
  });

  assert.equal(error.name, "ApplicationBoundaryError");
  assert.equal(typeof error.code, "string");
  assert.equal(typeof error.message, "string");
});

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
