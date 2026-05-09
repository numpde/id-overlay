import test from "node:test";
import assert from "node:assert/strict";

import {
  APPLICATION_COMMAND_KIND,
  createApplicationCommand,
} from "../../../application/command.js";
import { handleApplicationCommand } from "../../../application/handle-command.js";
import { createInitialApplicationState } from "../../../application/state.js";

// Class-c candidate for class-a: the application boundary is a pure reducer.
// It returns next state plus effect descriptions; it does not execute effects.

test("application command handling returns state and effect descriptions", () => {
  const result = handleApplicationCommand({
    state: createInitialApplicationState(),
    command: createApplicationCommand(APPLICATION_COMMAND_KIND.HYDRATE, {
      durableState: null,
    }),
  });

  assert.equal(Object.getPrototypeOf(result), Object.prototype);
  assert.deepEqual(Object.keys(result).sort(), ["effects", "state"]);
  assert.equal(Array.isArray(result.effects), true);
});
