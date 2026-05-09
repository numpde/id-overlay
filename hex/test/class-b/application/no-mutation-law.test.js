import test from "node:test";
import assert from "node:assert/strict";

import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "../../../application/command.js";
import { handleApplicationCommand } from "../../../application/handle-command.js";
import { createInitialApplicationState } from "../../../application/state.js";

// Class-b candidate for class-a: application command handling is pure with
// respect to caller-owned input. State and command inputs must survive intact.

test("application command handling does not mutate state or command input", () => {
  const state = createInitialApplicationState();
  const command = createApplicationCommand(APPLICATION_COMMAND_KIND.HYDRATE, {
    durableState: null,
  });
  const originalState = clonePlainData(state);
  const originalCommand = clonePlainData(command);

  deepFreeze(state);
  deepFreeze(command);

  handleApplicationCommand({ state, command });

  assert.deepEqual(state, originalState);
  assert.deepEqual(command, originalCommand);
});

function clonePlainData(value) {
  return JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== "object") {
    return value;
  }
  Object.freeze(value);
  for (const nestedValue of Object.values(value)) {
    deepFreeze(nestedValue);
  }
  return value;
}
